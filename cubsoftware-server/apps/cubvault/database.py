"""
KeyForge - Database Manager
Handles encrypted storage of passwords and vault data
"""

import json
import os
from typing import List, Dict, Optional
from datetime import datetime
from crypto_core import CryptoEngine


class PasswordEntry:
    """Represents a single password entry"""

    def __init__(self, entry_id: str, title: str, username: str,
                 password: str, url: str = "", notes: str = "",
                 category: str = "General", tags: List[str] = None,
                 created_at: str = None, modified_at: str = None):
        self.id = entry_id
        self.title = title
        self.username = username
        self.password = password
        self.url = url
        self.notes = notes
        self.category = category
        self.tags = tags or []
        self.created_at = created_at or datetime.now().isoformat()
        self.modified_at = modified_at or datetime.now().isoformat()
        self.password_history = []  # Track password changes

    def to_dict(self) -> Dict:
        """Convert to dictionary for JSON storage"""
        return {
            'id': self.id,
            'title': self.title,
            'username': self.username,
            'password': self.password,
            'url': self.url,
            'notes': self.notes,
            'category': self.category,
            'tags': self.tags,
            'created_at': self.created_at,
            'modified_at': self.modified_at,
            'password_history': self.password_history
        }

    @staticmethod
    def from_dict(data: Dict) -> 'PasswordEntry':
        """Create PasswordEntry from dictionary"""
        entry = PasswordEntry(
            entry_id=data['id'],
            title=data['title'],
            username=data['username'],
            password=data['password'],
            url=data.get('url', ''),
            notes=data.get('notes', ''),
            category=data.get('category', 'General'),
            tags=data.get('tags', []),
            created_at=data.get('created_at'),
            modified_at=data.get('modified_at')
        )
        entry.password_history = data.get('password_history', [])
        return entry


class VaultDatabase:
    """Manages the encrypted password vault"""

    def __init__(self, vault_path: str = "vault.enc"):
        self.vault_path = vault_path
        self.crypto = CryptoEngine()
        self.entries: List[PasswordEntry] = []
        self.master_password_hash = None
        self.master_password = None  # Stored in memory only when unlocked

    def is_initialized(self) -> bool:
        """Check if vault file exists"""
        return os.path.exists(self.vault_path)

    def initialize_vault(self, master_password: str) -> bool:
        """Create new vault with master password"""
        try:
            # Hash master password
            self.master_password_hash = self.crypto.hash_master_password(master_password)
            self.master_password = master_password

            # Create initial vault structure
            vault_data = {
                'version': '1.0',
                'master_password_hash': self.master_password_hash,
                'created_at': datetime.now().isoformat(),
                'entries': []
            }

            # Save vault
            self._save_vault(vault_data, master_password)
            return True
        except Exception as e:
            print(f"Failed to initialize vault: {e}")
            return False

    def unlock_vault(self, master_password: str) -> bool:
        """Unlock vault with master password"""
        try:
            if not self.is_initialized():
                return False

            # Read encrypted vault
            with open(self.vault_path, 'r') as f:
                encrypted_data = f.read()

            # Try to decrypt
            decrypted_json = self.crypto.decrypt(encrypted_data, master_password)

            if decrypted_json is None:
                return False

            vault_data = json.loads(decrypted_json)

            # Verify master password
            if not self.crypto.verify_master_password(master_password, vault_data['master_password_hash']):
                return False

            # Load entries
            self.master_password = master_password
            self.master_password_hash = vault_data['master_password_hash']
            self.entries = [PasswordEntry.from_dict(e) for e in vault_data.get('entries', [])]

            return True
        except Exception as e:
            print(f"Failed to unlock vault: {e}")
            return False

    def lock_vault(self):
        """Lock vault and clear sensitive data from memory"""
        self.master_password = None
        self.entries = []

    def add_entry(self, entry: PasswordEntry) -> bool:
        """Add new password entry"""
        try:
            if not self.master_password:
                return False

            self.entries.append(entry)
            self._save_current_vault()
            return True
        except Exception as e:
            print(f"Failed to add entry: {e}")
            return False

    def update_entry(self, entry_id: str, updated_entry: PasswordEntry) -> bool:
        """Update existing entry"""
        try:
            if not self.master_password:
                return False

            for i, entry in enumerate(self.entries):
                if entry.id == entry_id:
                    # Save old password to history
                    if entry.password != updated_entry.password:
                        updated_entry.password_history.append({
                            'password': entry.password,
                            'changed_at': datetime.now().isoformat()
                        })

                    updated_entry.modified_at = datetime.now().isoformat()
                    self.entries[i] = updated_entry
                    self._save_current_vault()
                    return True

            return False
        except Exception as e:
            print(f"Failed to update entry: {e}")
            return False

    def delete_entry(self, entry_id: str) -> bool:
        """Delete entry"""
        try:
            if not self.master_password:
                return False

            self.entries = [e for e in self.entries if e.id != entry_id]
            self._save_current_vault()
            return True
        except Exception as e:
            print(f"Failed to delete entry: {e}")
            return False

    def get_entry(self, entry_id: str) -> Optional[PasswordEntry]:
        """Get entry by ID"""
        for entry in self.entries:
            if entry.id == entry_id:
                return entry
        return None

    def search_entries(self, query: str) -> List[PasswordEntry]:
        """Search entries by title, username, url, or tags"""
        query_lower = query.lower()
        results = []

        for entry in self.entries:
            if (query_lower in entry.title.lower() or
                query_lower in entry.username.lower() or
                query_lower in entry.url.lower() or
                any(query_lower in tag.lower() for tag in entry.tags) or
                query_lower in entry.category.lower()):
                results.append(entry)

        return results

    def get_entries_by_category(self, category: str) -> List[PasswordEntry]:
        """Get all entries in a category"""
        return [e for e in self.entries if e.category == category]

    def get_all_categories(self) -> List[str]:
        """Get list of all categories"""
        categories = set(e.category for e in self.entries)
        return sorted(list(categories))

    def get_weak_passwords(self) -> List[PasswordEntry]:
        """Find entries with weak passwords"""
        weak_entries = []
        for entry in self.entries:
            score, _ = self.crypto.calculate_password_strength(entry.password)
            if score < 60:
                weak_entries.append(entry)
        return weak_entries

    def get_reused_passwords(self) -> Dict[str, List[PasswordEntry]]:
        """Find passwords that are reused across multiple entries"""
        password_map = {}

        for entry in self.entries:
            if entry.password in password_map:
                password_map[entry.password].append(entry)
            else:
                password_map[entry.password] = [entry]

        # Return only passwords used more than once
        return {pwd: entries for pwd, entries in password_map.items() if len(entries) > 1}

    def change_master_password(self, old_password: str, new_password: str) -> bool:
        """Change vault master password"""
        try:
            if old_password != self.master_password:
                return False

            # Hash new password
            new_hash = self.crypto.hash_master_password(new_password)

            # Update and save with new password
            self.master_password = new_password
            self.master_password_hash = new_hash
            self._save_current_vault()

            return True
        except Exception as e:
            print(f"Failed to change master password: {e}")
            return False

    def _save_current_vault(self):
        """Save current vault state"""
        vault_data = {
            'version': '1.0',
            'master_password_hash': self.master_password_hash,
            'created_at': datetime.now().isoformat(),
            'entries': [e.to_dict() for e in self.entries]
        }
        self._save_vault(vault_data, self.master_password)

    def _save_vault(self, vault_data: Dict, master_password: str):
        """Encrypt and save vault to disk"""
        # Convert to JSON
        json_data = json.dumps(vault_data, indent=2)

        # Encrypt
        encrypted_data = self.crypto.encrypt(json_data, master_password)

        # Save to file
        with open(self.vault_path, 'w') as f:
            f.write(encrypted_data)

    def export_vault(self, export_path: str, include_passwords: bool = True) -> bool:
        """Export vault to JSON file (unencrypted - use carefully!)"""
        try:
            if not self.master_password:
                return False

            export_data = {
                'exported_at': datetime.now().isoformat(),
                'entries': []
            }

            for entry in self.entries:
                entry_dict = entry.to_dict()
                if not include_passwords:
                    entry_dict['password'] = '****HIDDEN****'
                export_data['entries'].append(entry_dict)

            with open(export_path, 'w') as f:
                json.dump(export_data, f, indent=2)

            return True
        except Exception as e:
            print(f"Failed to export vault: {e}")
            return False

    def get_vault_stats(self) -> Dict:
        """Get vault statistics"""
        if not self.entries:
            return {
                'total_entries': 0,
                'categories': 0,
                'weak_passwords': 0,
                'reused_passwords': 0,
                'average_strength': 0
            }

        weak_count = len(self.get_weak_passwords())
        reused_count = sum(len(entries) for entries in self.get_reused_passwords().values())

        total_strength = sum(self.crypto.calculate_password_strength(e.password)[0]
                           for e in self.entries)
        avg_strength = total_strength / len(self.entries) if self.entries else 0

        return {
            'total_entries': len(self.entries),
            'categories': len(self.get_all_categories()),
            'weak_passwords': weak_count,
            'reused_passwords': reused_count,
            'average_strength': int(avg_strength)
        }
