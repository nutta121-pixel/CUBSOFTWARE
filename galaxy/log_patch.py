"""
log_patch.py — Applies coloured [Tag] output then runs main.py.
Keeps main.py untouched; edit this file for log appearance changes.
"""
import re
import builtins
import logging
import runpy
import os

_C = '\x1b[94m'   # bright blue for galaxy
_R = '\x1b[0m'
_TAG = re.compile(r'\[([A-Za-z][A-Za-z0-9 _-]*)\]')

def _colorize(s):
    return _TAG.sub(lambda m: f'{_C}[{m.group(1)}]{_R}', s)

# Patch print()
_orig_print = builtins.print
def _print(*args, **kwargs):
    if args and isinstance(args[0], str):
        args = (_colorize(args[0]),) + args[1:]
    _orig_print(*args, **kwargs)
builtins.print = _print

# Patch logging.StreamHandler.emit so all handlers (including discord.py's) get colour
_orig_emit = logging.StreamHandler.emit
def _colored_emit(self, record):
    try:
        msg = self.format(record)
        msg = _colorize(msg)
        self.stream.write(msg + self.terminator)
        self.flush()
    except Exception:
        self.handleError(record)
logging.StreamHandler.emit = _colored_emit

# Run main.py as __main__
runpy.run_path(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'main.py'), run_name='__main__')
