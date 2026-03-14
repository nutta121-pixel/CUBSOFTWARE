#!/usr/bin/env python3
"""
CubPresence Discord RPC Bridge for Linux
=========================================
On Linux, Discord exposes its RPC via a Unix socket, not TCP.
This script bridges WebSocket (ws://127.0.0.1:6463) → Discord Unix IPC socket
so CubPresence works in your browser exactly like on Windows/Mac.

Usage:
    python3 discord-rpc-bridge.py

Requirements: Python 3.7+ (no external packages needed)
Keep this running while using CubPresence.
"""

import asyncio
import base64
import hashlib
import json
import os
import re
import struct
import sys

HOST = '127.0.0.1'
PORT = 6463
XDG = os.environ.get('XDG_RUNTIME_DIR', f'/run/user/{os.getuid()}')


def find_discord_socket():
    for i in range(10):
        path = f'{XDG}/discord-ipc-{i}'
        if os.path.exists(path):
            return path
    return None


def ws_accept_key(key: str) -> str:
    GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
    return base64.b64encode(hashlib.sha1((key + GUID).encode()).digest()).decode()


def parse_qs(qs: str) -> dict:
    params = {}
    for part in qs.split('&'):
        if '=' in part:
            k, v = part.split('=', 1)
            params[k] = v
    return params


async def read_ws_frame(reader: asyncio.StreamReader):
    """Read one complete WebSocket frame. Returns (opcode, payload_bytes)."""
    b = await reader.readexactly(2)
    opcode = b[0] & 0x0F
    masked = (b[1] >> 7) & 1
    length = b[1] & 0x7F
    if length == 126:
        length = struct.unpack('>H', await reader.readexactly(2))[0]
    elif length == 127:
        length = struct.unpack('>Q', await reader.readexactly(8))[0]
    mask_key = await reader.readexactly(4) if masked else b'\x00\x00\x00\x00'
    data = bytearray(await reader.readexactly(length))
    if masked:
        for i in range(length):
            data[i] ^= mask_key[i % 4]
    return opcode, bytes(data)


def make_ws_frame(payload, opcode=1) -> bytes:
    """Build an unmasked WebSocket frame (server → client)."""
    data = payload if isinstance(payload, bytes) else payload.encode()
    n = len(data)
    if n < 126:
        header = bytes([0x80 | opcode, n])
    elif n < 65536:
        header = bytes([0x80 | opcode, 126]) + struct.pack('>H', n)
    else:
        header = bytes([0x80 | opcode, 127]) + struct.pack('>Q', n)
    return header + data


def make_ipc_frame(opcode: int, payload) -> bytes:
    """Build a Discord IPC frame: [op: u32le][len: u32le][json bytes]."""
    data = payload if isinstance(payload, bytes) else payload.encode()
    return struct.pack('<II', opcode, len(data)) + data


async def read_ipc_frame(reader: asyncio.StreamReader):
    """Read one Discord IPC frame. Returns (opcode, payload_bytes)."""
    header = await reader.readexactly(8)
    opcode, length = struct.unpack('<II', header)
    payload = await reader.readexactly(length)
    return opcode, payload


async def handle_connection(tcp_reader: asyncio.StreamReader, tcp_writer: asyncio.StreamWriter):
    peer = tcp_writer.get_extra_info('peername')
    print(f'[bridge] New connection from {peer}')

    # ── Read HTTP upgrade request ────────────────────────────────────────────
    raw = b''
    while b'\r\n\r\n' not in raw:
        chunk = await tcp_reader.read(4096)
        if not chunk:
            tcp_writer.close()
            return
        raw += chunk

    lines = raw.split(b'\r\n')
    request_line = lines[0].decode(errors='replace')
    headers = {}
    for line in lines[1:]:
        if b':' in line:
            k, v = line.split(b':', 1)
            headers[k.strip().lower().decode()] = v.strip().decode()

    # Extract client_id + version from query string
    m = re.search(r'\?([^ ]*)', request_line)
    params = parse_qs(m.group(1)) if m else {}
    client_id = params.get('client_id', '')
    version = params.get('v', '1')
    print(f'[bridge] client_id={client_id!r} v={version}')

    # ── WebSocket handshake ──────────────────────────────────────────────────
    ws_key = headers.get('sec-websocket-key', '')
    response = (
        'HTTP/1.1 101 Switching Protocols\r\n'
        'Upgrade: websocket\r\n'
        'Connection: Upgrade\r\n'
        f'Sec-WebSocket-Accept: {ws_accept_key(ws_key)}\r\n'
        '\r\n'
    ).encode()
    tcp_writer.write(response)
    await tcp_writer.drain()

    # ── Connect to Discord Unix socket ───────────────────────────────────────
    sock_path = find_discord_socket()
    if not sock_path:
        print('[bridge] ERROR: Discord IPC socket not found — is Discord running?')
        tcp_writer.write(make_ws_frame(b'', opcode=8))
        await tcp_writer.drain()
        tcp_writer.close()
        return

    try:
        ipc_reader, ipc_writer = await asyncio.open_unix_connection(sock_path)
        print(f'[bridge] Connected to {sock_path}')
    except Exception as e:
        print(f'[bridge] ERROR connecting to Discord socket: {e}')
        tcp_writer.write(make_ws_frame(b'', opcode=8))
        await tcp_writer.drain()
        tcp_writer.close()
        return

    # ── Send Discord IPC handshake ───────────────────────────────────────────
    handshake = json.dumps({'v': int(version), 'client_id': client_id})
    ipc_writer.write(make_ipc_frame(0, handshake))
    await ipc_writer.drain()
    print('[bridge] Handshake sent')

    # ── Relay: WebSocket ↔ Discord IPC ───────────────────────────────────────
    async def ws_to_ipc():
        try:
            while True:
                opcode, data = await read_ws_frame(tcp_reader)
                if opcode == 8:  # WS close
                    break
                if opcode in (1, 2):  # text / binary
                    ipc_writer.write(make_ipc_frame(1, data))
                    await ipc_writer.drain()
        except Exception as e:
            pass
        finally:
            try:
                ipc_writer.close()
            except Exception:
                pass

    async def ipc_to_ws():
        try:
            while True:
                ipc_op, payload = await read_ipc_frame(ipc_reader)
                if ipc_op == 2:  # IPC close
                    tcp_writer.write(make_ws_frame(b'', opcode=8))
                    await tcp_writer.drain()
                    break
                elif ipc_op == 3:  # ping → pong
                    ipc_writer.write(make_ipc_frame(4, payload))
                    await ipc_writer.drain()
                else:  # normal frame → forward as WS text
                    tcp_writer.write(make_ws_frame(payload, opcode=1))
                    await tcp_writer.drain()
        except Exception as e:
            pass
        finally:
            try:
                tcp_writer.close()
            except Exception:
                pass

    await asyncio.gather(ws_to_ipc(), ipc_to_ws(), return_exceptions=True)
    print(f'[bridge] Connection from {peer} closed')


async def main():
    sock_path = find_discord_socket()
    if not sock_path:
        print(f'ERROR: No Discord IPC socket found in {XDG}')
        print('       Make sure Discord desktop is running, then try again.')
        sys.exit(1)

    print('=' * 50)
    print('  CubPresence Discord RPC Bridge')
    print('=' * 50)
    print(f'  Discord socket : {sock_path}')
    print(f'  Listening on   : ws://{HOST}:{PORT}')
    print()
    print('  Keep this window open while using CubPresence.')
    print('  Press Ctrl+C to stop.')
    print('=' * 50)

    server = await asyncio.start_server(handle_connection, HOST, PORT)
    async with server:
        await server.serve_forever()


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print('\n[bridge] Stopped.')
