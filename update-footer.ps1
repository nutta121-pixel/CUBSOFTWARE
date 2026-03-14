 = "G:\GitHub Projects\cubsoftware-server\streamerbot-docs\commands\"

 = '        <footer class="site-footer">
            <p>&copy; 2025 CUB SOFTWARE. All rights reserved.</p>
            <p class="footer-note">StreamerBot Commands Collection - MIT Licensed</p>
            <div class="footer-links">
                <a href="http://localhost:3000/terms">Terms of Use</a>
                <span class="separator">&bull;</span>
                <a href="http://localhost:3000/privacy">Privacy Policy</a>
                <span class="separator">&bull;</span>
                <a href="https://github.com/HexEchoTV/StreamerBot-Commands">GitHub</a>
                <span class="separator">&bull;</span>
                <a href="http://localhost:3000">CubSoftware Home</a>
            </div>
        </footer>'

 = '        <footer class="footer">
            <div class="container">
                <div class="footer-content">
                    <div class="footer-text">
                        &copy; 2025 CUB SOFTWARE. Made with love by
                        <a href="https://discord.com/users/378501056008683530" target="_blank" rel="noopener noreferrer" class="footer-link">CUB</a>
                    </div>
                    <div class="footer-legal-links">
                        <a href="http://localhost:3003" class="footer-legal-link" target="_blank">QuestCord</a>
                        <span class="footer-separator">|</span>
                        <a href="/terms" class="footer-legal-link">Terms of Use</a>
                        <span class="footer-separator">|</span>
                        <a href="/privacy" class="footer-legal-link">Privacy Policy</a>
                        <span class="footer-separator">|</span>
                        <a href="/copyright" class="footer-legal-link">Copyright</a>
                        <span class="footer-separator">|</span>
                        <a href="/contact" class="footer-legal-link">Contact</a>
                    </div>
                </div>
            </div>
        </footer>'

$updatedCount = 0
$files = Get-ChildItem -Path $folderPath -Filter "*.html"

foreach ($file in $files) {
    $content = Get-Content -Path $file.FullName -Raw
    if ($content.Contains($oldFooter)) {
        $newContent = $content.Replace($oldFooter, $newFooter)
        Set-Content -Path $file.FullName -Value $newContent -NoNewline
        $updatedCount++
        Write-Host "Updated: $($file.Name)"
    }
}

Write-Host "Total files updated: $updatedCount"
