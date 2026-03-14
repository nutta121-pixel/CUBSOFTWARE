import tkinter as tk
from tkinter import ttk, scrolledtext, messagebox
import threading
import queue
import subprocess
import os
import webbrowser
import re

class DownloaderGUI:
    def __init__(self, root):
        self.root = root
        self.root.title("YouTube & Spotify MP3 Downloader")
        self.root.geometry("700x650")

        # URL queue
        self.url_queue = []
        self.download_thread = None
        self.is_downloading = False

        # Create UI
        self.create_widgets()

    def create_widgets(self):
        # Title
        title = tk.Label(self.root, text="YouTube & Spotify MP3 Downloader",
                        font=("Arial", 16, "bold"))
        title.pack(pady=10)

        # URL Input Frame
        input_frame = tk.Frame(self.root)
        input_frame.pack(fill=tk.X, padx=20, pady=5)

        tk.Label(input_frame, text="URL:").pack(side=tk.LEFT)

        self.url_entry = tk.Entry(input_frame, width=50)
        self.url_entry.pack(side=tk.LEFT, padx=5, fill=tk.X, expand=True)
        self.url_entry.bind('<Return>', lambda e: self.add_url())

        self.add_btn = tk.Button(input_frame, text="Add to Queue",
                                command=self.add_url, bg="#4CAF50", fg="white")
        self.add_btn.pack(side=tk.LEFT)

        # Queue Frame
        queue_label = tk.Label(self.root, text="Download Queue:",
                              font=("Arial", 12, "bold"))
        queue_label.pack(anchor=tk.W, padx=20, pady=(10,5))

        # Queue Listbox with Scrollbar
        list_frame = tk.Frame(self.root)
        list_frame.pack(fill=tk.BOTH, expand=True, padx=20, pady=5)

        scrollbar = tk.Scrollbar(list_frame)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)

        self.queue_listbox = tk.Listbox(list_frame, yscrollcommand=scrollbar.set,
                                        height=10, font=("Arial", 10))
        self.queue_listbox.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.config(command=self.queue_listbox.yview)

        # Buttons Frame
        btn_frame = tk.Frame(self.root)
        btn_frame.pack(fill=tk.X, padx=20, pady=10)

        self.move_up_btn = tk.Button(btn_frame, text="Move Up",
                                     command=self.move_up, bg="#9C27B0", fg="white")
        self.move_up_btn.pack(side=tk.LEFT, padx=5)

        self.move_down_btn = tk.Button(btn_frame, text="Move Down",
                                       command=self.move_down, bg="#9C27B0", fg="white")
        self.move_down_btn.pack(side=tk.LEFT, padx=5)

        self.remove_btn = tk.Button(btn_frame, text="Remove Selected",
                                    command=self.remove_url, bg="#f44336", fg="white")
        self.remove_btn.pack(side=tk.LEFT, padx=5)

        self.clear_btn = tk.Button(btn_frame, text="Clear Queue",
                                   command=self.clear_queue, bg="#ff9800", fg="white")
        self.clear_btn.pack(side=tk.LEFT, padx=5)

        self.download_btn = tk.Button(btn_frame, text="Start Download",
                                     command=self.start_download,
                                     bg="#2196F3", fg="white", font=("Arial", 10, "bold"))
        self.download_btn.pack(side=tk.RIGHT, padx=5)

        self.stop_btn = tk.Button(btn_frame, text="Stop Download",
                                 command=self.stop_download,
                                 bg="#9E9E9E", fg="white", state=tk.DISABLED)
        self.stop_btn.pack(side=tk.RIGHT, padx=5)

        # Progress Frame
        progress_frame = tk.Frame(self.root, bg="#f0f0f0", relief=tk.RIDGE, bd=2)
        progress_frame.pack(fill=tk.X, padx=20, pady=10)

        self.progress_label = tk.Label(progress_frame, text="Ready to start",
                                       font=("Arial", 11, "bold"), bg="#f0f0f0")
        self.progress_label.pack(pady=5)

        self.current_song_label = tk.Label(progress_frame, text="",
                                          font=("Arial", 9), bg="#f0f0f0", fg="#555")
        self.current_song_label.pack(pady=2)

        # Status Frame
        status_label = tk.Label(self.root, text="Status:",
                               font=("Arial", 12, "bold"))
        status_label.pack(anchor=tk.W, padx=20, pady=(10,5))

        self.status_text = scrolledtext.ScrolledText(self.root, height=8,
                                                     font=("Courier", 9))
        self.status_text.pack(fill=tk.BOTH, expand=False, padx=20, pady=5)

        # Credit Frame
        credit_frame = tk.Frame(self.root)
        credit_frame.pack(pady=5)

        credit_label = tk.Label(credit_frame, text="Made by CUB",
                               font=("Arial", 10))
        credit_label.pack(side=tk.LEFT, padx=5)

        discord_link = tk.Label(credit_frame, text="Discord Profile",
                               font=("Arial", 10), fg="#5865F2", cursor="hand2")
        discord_link.pack(side=tk.LEFT)
        discord_link.bind("<Button-1>", lambda e: webbrowser.open("https://discord.com/users/378501056008683530"))

        self.log("Ready to download! Add URLs to the queue.")

    def add_url(self):
        url = self.url_entry.get().strip()
        if url:
            if url in self.url_queue:
                messagebox.showwarning("Duplicate", "This URL is already in the queue!")
                return

            self.url_queue.append(url)
            self.queue_listbox.insert(tk.END, url)
            self.url_entry.delete(0, tk.END)
            self.log(f"Added: {url}")

            # Auto-start download if not already downloading
            if not self.is_downloading:
                self.start_download()
        else:
            messagebox.showwarning("Empty URL", "Please enter a URL!")

    def remove_url(self):
        selection = self.queue_listbox.curselection()
        if selection:
            index = selection[0]
            url = self.url_queue[index]
            self.url_queue.pop(index)
            self.queue_listbox.delete(index)
            self.log(f"Removed: {url}")
        else:
            messagebox.showwarning("No Selection", "Please select a URL to remove!")

    def clear_queue(self):
        if self.url_queue:
            if messagebox.askyesno("Clear Queue", "Are you sure you want to clear the entire queue?"):
                self.url_queue.clear()
                self.queue_listbox.delete(0, tk.END)
                self.log("Queue cleared!")
        else:
            messagebox.showinfo("Empty Queue", "The queue is already empty!")

    def move_up(self):
        selection = self.queue_listbox.curselection()
        if not selection:
            messagebox.showwarning("No Selection", "Please select a URL to move!")
            return

        index = selection[0]
        if index == 0:
            messagebox.showinfo("Can't Move", "This item is already at the top!")
            return

        # Don't allow moving if currently downloading
        if self.is_downloading and index == 0:
            messagebox.showwarning("Download in Progress", "Cannot move the item currently being downloaded!")
            return

        # Swap in list
        self.url_queue[index], self.url_queue[index-1] = self.url_queue[index-1], self.url_queue[index]

        # Update listbox
        self.queue_listbox.delete(index)
        self.queue_listbox.insert(index-1, self.url_queue[index-1])
        self.queue_listbox.selection_clear(0, tk.END)
        self.queue_listbox.selection_set(index-1)
        self.log(f"Moved up: {self.url_queue[index-1]}")

    def move_down(self):
        selection = self.queue_listbox.curselection()
        if not selection:
            messagebox.showwarning("No Selection", "Please select a URL to move!")
            return

        index = selection[0]
        if index >= len(self.url_queue) - 1:
            messagebox.showinfo("Can't Move", "This item is already at the bottom!")
            return

        # Don't allow moving if it's currently downloading
        if self.is_downloading and index == 0:
            messagebox.showwarning("Download in Progress", "Cannot move the item currently being downloaded!")
            return

        # Swap in list
        self.url_queue[index], self.url_queue[index+1] = self.url_queue[index+1], self.url_queue[index]

        # Update listbox
        self.queue_listbox.delete(index)
        self.queue_listbox.insert(index+1, self.url_queue[index+1])
        self.queue_listbox.selection_clear(0, tk.END)
        self.queue_listbox.selection_set(index+1)
        self.log(f"Moved down: {self.url_queue[index+1]}")

    def log(self, message):
        self.status_text.insert(tk.END, f"{message}\n")
        self.status_text.see(tk.END)

    def start_download(self):
        if not self.url_queue:
            messagebox.showwarning("Empty Queue", "Add some URLs to the queue first!")
            return

        if self.is_downloading:
            messagebox.showinfo("Already Downloading", "Download is already in progress!")
            return

        self.is_downloading = True
        self.download_btn.config(state=tk.DISABLED)
        self.stop_btn.config(state=tk.NORMAL)

        # Start download thread
        self.download_thread = threading.Thread(target=self.download_worker, daemon=True)
        self.download_thread.start()

    def stop_download(self):
        self.is_downloading = False
        self.log("\nDownload stopped by user!")
        self.download_btn.config(state=tk.NORMAL)
        self.stop_btn.config(state=tk.DISABLED)

    def download_worker(self):
        python_path = r"C:\Users\Thorton\AppData\Local\Programs\Python\Python312\python.exe"
        downloader_path = os.path.join(os.path.dirname(__file__), "downloader.py")

        while self.url_queue and self.is_downloading:
            url = self.url_queue[0]
            self.log(f"\n{'='*60}")
            self.log(f"Downloading: {url}")
            self.log(f"{'='*60}")

            # Reset progress
            self.root.after(0, lambda: self.progress_label.config(text="Processing..."))
            self.root.after(0, lambda: self.current_song_label.config(text=""))

            try:
                playlist_total = 0
                current_item = 0

                process = subprocess.Popen(
                    [python_path, downloader_path, url],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    bufsize=1,
                    creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
                )

                for line in process.stdout:
                    if not self.is_downloading:
                        process.terminate()
                        break

                    self.log(line.rstrip())

                    # Parse playlist info
                    if "Downloading" in line and "items of" in line:
                        match = re.search(r'Downloading (\d+) items of (\d+)', line)
                        if match:
                            playlist_total = int(match.group(2))

                    # Parse current item
                    if "Downloading item" in line and "of" in line:
                        match = re.search(r'Downloading item (\d+) of (\d+)', line)
                        if match:
                            current_item = int(match.group(1))
                            total = int(match.group(2))
                            remaining = total - current_item
                            progress_text = f"Downloading: Song {current_item} of {total} ({remaining} remaining)"
                            self.root.after(0, lambda t=progress_text: self.progress_label.config(text=t))

                    # Parse song title
                    if "Successfully downloaded:" in line:
                        song_title = line.split("Successfully downloaded:")[-1].strip()
                        self.root.after(0, lambda s=song_title: self.current_song_label.config(text=f"Current: {s}"))

                process.wait()

                if process.returncode == 0:
                    self.log(f"✓ Completed: {url}")
                    self.root.after(0, lambda: self.progress_label.config(text="✓ Completed!"))
                else:
                    self.log(f"✗ Failed: {url}")
                    self.root.after(0, lambda: self.progress_label.config(text="✗ Failed"))

                # Remove from queue and listbox
                self.url_queue.pop(0)
                self.root.after(0, lambda: self.queue_listbox.delete(0))

            except Exception as e:
                self.log(f"Error: {e}")

        # Done downloading
        self.root.after(0, self.download_complete)

    def download_complete(self):
        self.is_downloading = False
        self.download_btn.config(state=tk.NORMAL)
        self.stop_btn.config(state=tk.DISABLED)
        self.log("\n" + "="*60)
        self.log("All downloads complete!")
        self.log("="*60)
        messagebox.showinfo("Complete", "All downloads finished!")

def main():
    root = tk.Tk()
    app = DownloaderGUI(root)
    root.mainloop()

if __name__ == "__main__":
    main()
