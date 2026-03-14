"""
SecureVault - Cryptography Core
Strong encryption using AES-256-GCM and Argon2
"""

import os
import base64
import json
from typing import Optional, Tuple
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

class CryptoEngine:
    """Handles all encryption/decryption operations"""

    def __init__(self):
        self.ph = PasswordHasher(
            time_cost=3,        # Number of iterations
            memory_cost=65536,  # 64 MB
            parallelism=4,      # 4 threads
            hash_len=32,        # 32 bytes output
            salt_len=16         # 16 bytes salt
        )

    def hash_master_password(self, password: str) -> str:
        """Hash master password using Argon2"""
        return self.ph.hash(password)

    def verify_master_password(self, password: str, hash: str) -> bool:
        """Verify master password against hash"""
        try:
            self.ph.verify(hash, password)
            return True
        except VerifyMismatchError:
            return False

    def derive_key(self, password: str, salt: bytes) -> bytes:
        """Derive encryption key from password using PBKDF2"""
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,  # 256 bits for AES-256
            salt=salt,
            iterations=600000,  # OWASP recommendation
        )
        return kdf.derive(password.encode())

    def encrypt(self, plaintext: str, password: str) -> str:
        """Encrypt data using AES-256-GCM

        Returns: Base64 encoded string containing: salt + nonce + ciphertext + tag
        """
        # Generate random salt and nonce
        salt = os.urandom(16)
        nonce = os.urandom(12)  # GCM standard nonce size

        # Derive key from password
        key = self.derive_key(password, salt)

        # Encrypt
        aesgcm = AESGCM(key)
        ciphertext = aesgcm.encrypt(nonce, plaintext.encode(), None)

        # Combine: salt + nonce + ciphertext (ciphertext includes auth tag)
        encrypted_data = salt + nonce + ciphertext

        # Return as base64
        return base64.b64encode(encrypted_data).decode('utf-8')

    def decrypt(self, encrypted_b64: str, password: str) -> Optional[str]:
        """Decrypt data encrypted with encrypt()

        Returns: Decrypted plaintext or None if decryption fails
        """
        try:
            # Decode from base64
            encrypted_data = base64.b64decode(encrypted_b64)

            # Extract salt, nonce, and ciphertext
            salt = encrypted_data[:16]
            nonce = encrypted_data[16:28]
            ciphertext = encrypted_data[28:]

            # Derive key
            key = self.derive_key(password, salt)

            # Decrypt
            aesgcm = AESGCM(key)
            plaintext = aesgcm.decrypt(nonce, ciphertext, None)

            return plaintext.decode('utf-8')
        except Exception as e:
            return None

    def generate_random_password(self, length: int = 16,
                                 use_uppercase: bool = True,
                                 use_lowercase: bool = True,
                                 use_digits: bool = True,
                                 use_symbols: bool = True,
                                 exclude_ambiguous: bool = True) -> str:
        """Generate cryptographically secure random password"""
        import string
        import secrets

        chars = ''
        if use_lowercase:
            chars += string.ascii_lowercase
        if use_uppercase:
            chars += string.ascii_uppercase
        if use_digits:
            chars += string.digits
        if use_symbols:
            chars += '!@#$%^&*()_+-=[]{}|;:,.<>?'

        if exclude_ambiguous:
            # Remove ambiguous characters
            ambiguous = 'il1Lo0O'
            chars = ''.join(c for c in chars if c not in ambiguous)

        if not chars:
            chars = string.ascii_letters + string.digits

        # Generate password
        password = ''.join(secrets.choice(chars) for _ in range(length))

        # Ensure at least one character from each enabled category
        if use_uppercase and not any(c.isupper() for c in password):
            password = secrets.choice(string.ascii_uppercase) + password[1:]
        if use_lowercase and not any(c.islower() for c in password):
            password = secrets.choice(string.ascii_lowercase) + password[1:]
        if use_digits and not any(c.isdigit() for c in password):
            password = secrets.choice(string.digits) + password[1:]
        if use_symbols and not any(c in '!@#$%^&*()_+-=[]{}|;:,.<>?' for c in password):
            password = secrets.choice('!@#$%^&*') + password[1:]

        # Shuffle to randomize position of forced characters
        password_list = list(password)
        secrets.SystemRandom().shuffle(password_list)

        return ''.join(password_list)

    def calculate_password_strength(self, password: str) -> Tuple[int, str]:
        """Calculate password strength (0-100) and return rating

        Returns: (score, rating_text)
        """
        if not password:
            return (0, "No Password")

        score = 0
        length = len(password)

        # Length scoring (max 40 points)
        if length >= 16:
            score += 40
        elif length >= 12:
            score += 30
        elif length >= 8:
            score += 20
        else:
            score += length * 2

        # Character variety (max 30 points)
        has_lower = any(c.islower() for c in password)
        has_upper = any(c.isupper() for c in password)
        has_digit = any(c.isdigit() for c in password)
        has_symbol = any(c in '!@#$%^&*()_+-=[]{}|;:,.<>?~`' for c in password)

        variety_count = sum([has_lower, has_upper, has_digit, has_symbol])
        score += variety_count * 7.5

        # Uniqueness bonus (max 20 points)
        unique_chars = len(set(password))
        uniqueness_ratio = unique_chars / length if length > 0 else 0
        score += uniqueness_ratio * 20

        # Complexity patterns (max 10 points)
        if not any(password[i:i+3] == password[i]*3 for i in range(len(password)-2)):
            score += 5  # No repeated 3+ character sequences
        if not any(password.lower()[i:i+3] in 'abcdefghijklmnopqrstuvwxyz' for i in range(len(password)-2)):
            score += 5  # No sequential alphabet

        # Cap at 100
        score = min(100, int(score))

        # Rating
        if score >= 80:
            rating = "Excellent"
        elif score >= 60:
            rating = "Good"
        elif score >= 40:
            rating = "Fair"
        elif score >= 20:
            rating = "Weak"
        else:
            rating = "Very Weak"

        return (score, rating)


# Test function
if __name__ == "__main__":
    crypto = CryptoEngine()

    # Test encryption/decryption
    password = "my_master_password"
    data = "This is my secret password!"

    print("Testing encryption...")
    encrypted = crypto.encrypt(data, password)
    print(f"Encrypted: {encrypted[:50]}...")

    decrypted = crypto.decrypt(encrypted, password)
    print(f"Decrypted: {decrypted}")
    print(f"Match: {data == decrypted}")

    # Test password generation
    print("\nTesting password generation...")
    for _ in range(3):
        pwd = crypto.generate_random_password(16)
        score, rating = crypto.calculate_password_strength(pwd)
        print(f"Password: {pwd} | Strength: {score}/100 ({rating})")
