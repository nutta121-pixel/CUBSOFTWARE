// Command Page Renderer
// Dynamically renders command detail pages from commands-data.js

document.addEventListener('DOMContentLoaded', function() {
    // Get command ID from URL parameter or data attribute
    const urlParams = new URLSearchParams(window.location.search);
    let commandId = urlParams.get('cmd');

    // Also check for data attribute on body (for individual HTML files)
    if (!commandId) {
        commandId = document.body.dataset.command;
    }

    if (!commandId || !commandsData[commandId]) {
        renderNotFound();
        return;
    }

    const cmd = commandsData[commandId];
    renderCommand(cmd, commandId);
});

function renderNotFound() {
    const main = document.querySelector('.page-content') || document.querySelector('main');
    if (main) {
        main.innerHTML = `
            <div class="command-header">
                <h1>Command Not Found</h1>
                <p>The requested command could not be found.</p>
                <a href="../index.html" class="back-link">&#8592; Back to All Commands</a>
            </div>
        `;
    }
    document.title = 'Not Found - StreamerBot Commands';
}

function renderCommand(cmd, commandId) {
    // Update page title
    document.title = `${cmd.name} - StreamerBot Commands`;

    // Render breadcrumb
    const breadcrumb = document.getElementById('breadcrumb');
    if (breadcrumb) {
        breadcrumb.innerHTML = `
            <a href="../index.html">Commands</a>
            <span>/</span>
            <a href="../index.html#${cmd.categoryAnchor}">${cmd.category}</a>
            <span>/</span>
            <span class="current">${cmd.name}</span>
        `;
    }

    // Render command header
    const header = document.getElementById('command-header');
    if (header) {
        let commandCode = '';
        if (cmd.command) {
            commandCode = `<code>${cmd.command}</code>`;
        }

        let badges = cmd.badges.map(badge => {
            let badgeClass = 'meta-badge';
            if (badge.toLowerCase() === 'core') badgeClass += ' category';
            if (badge.toLowerCase() === 'gambling') badgeClass += ' category';
            if (badge.toLowerCase() === 'earning') badgeClass += ' category';
            if (badge.toLowerCase() === 'pvp') badgeClass += ' category';
            if (badge.toLowerCase() === 'utility') badgeClass += ' category';
            return `<span class="${badgeClass}">${badge}</span>`;
        }).join('');

        header.innerHTML = `
            <div class="command-title">
                <h1>${cmd.name}</h1>
                ${commandCode}
            </div>
            <div class="command-meta">
                <span class="meta-badge status-completed">${cmd.status}</span>
                ${badges}
            </div>
            <p class="command-description-full">${cmd.description}</p>
        `;
    }

    // Render commands section
    const commandsSection = document.getElementById('commands-section');
    if (commandsSection && cmd.commands && cmd.commands.length > 0) {
        let rows = cmd.commands.map(c => `
            <tr>
                <td><code>${c.cmd}</code></td>
                <td>${c.desc}</td>
            </tr>
        `).join('');

        commandsSection.innerHTML = `
            <h2>Commands</h2>
            <table class="config-table">
                <thead>
                    <tr>
                        <th>Command</th>
                        <th>Description</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    } else if (commandsSection) {
        commandsSection.style.display = 'none';
    }

    // Render features section
    const featuresSection = document.getElementById('features-section');
    if (featuresSection && cmd.features && cmd.features.length > 0) {
        let features = cmd.features.map(f => `<li>${f}</li>`).join('');
        featuresSection.innerHTML = `
            <h2>Features</h2>
            <ul>${features}</ul>
        `;
    } else if (featuresSection) {
        featuresSection.style.display = 'none';
    }

    // Render configuration section
    const configSection = document.getElementById('config-section');
    if (configSection && cmd.config && cmd.config.length > 0) {
        let rows = cmd.config.map(c => `
            <tr>
                <td><code>${c.variable}</code></td>
                <td>${c.default}</td>
                <td>${c.desc}</td>
            </tr>
        `).join('');

        configSection.innerHTML = `
            <h2>Configuration</h2>
            <p>Set in <code>ConfigSetup.cs</code>:</p>
            <table class="config-table">
                <thead>
                    <tr>
                        <th>Variable</th>
                        <th>Default</th>
                        <th>Description</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    } else if (configSection) {
        configSection.style.display = 'none';
    }

    // Render how it works section (for blackjack-style commands)
    const howItWorksSection = document.getElementById('howitworks-section');
    if (howItWorksSection && cmd.howItWorks) {
        let content = '<h2>How It Works</h2>';

        if (cmd.howItWorks.starting) {
            content += '<h3>Starting a Game</h3><ol>';
            content += cmd.howItWorks.starting.map(s => `<li>${s}</li>`).join('');
            content += '</ol>';
        }

        if (cmd.howItWorks.outcomes) {
            content += '<h3>Game Outcomes</h3>';
            content += '<table class="config-table"><thead><tr><th>Outcome</th><th>Payout</th></tr></thead><tbody>';
            content += cmd.howItWorks.outcomes.map(o => `<tr><td>${o.outcome}</td><td>${o.payout}</td></tr>`).join('');
            content += '</tbody></table>';
        }

        howItWorksSection.innerHTML = content;
    } else if (howItWorksSection) {
        howItWorksSection.style.display = 'none';
    }

    // Render card values section (for card games)
    const cardValuesSection = document.getElementById('cardvalues-section');
    if (cardValuesSection && cmd.cardValues) {
        let rows = cmd.cardValues.map(c => `
            <tr>
                <td>${c.card}</td>
                <td>${c.value}</td>
            </tr>
        `).join('');

        cardValuesSection.innerHTML = `
            <h2>Card Values</h2>
            <table class="config-table">
                <thead>
                    <tr>
                        <th>Card</th>
                        <th>Value</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    } else if (cardValuesSection) {
        cardValuesSection.style.display = 'none';
    }

    // Render examples section
    const examplesSection = document.getElementById('examples-section');
    if (examplesSection && cmd.examples && cmd.examples.length > 0) {
        let examples = cmd.examples.map(ex => {
            let lines = ex.lines.map(line => {
                if (line.type === 'user') {
                    return `<div class="chat-line"><span class="user">User:</span><span class="message">${line.text}</span></div>`;
                } else {
                    return `<div class="chat-line"><span class="bot">Bot:</span><span class="message">${line.text}</span></div>`;
                }
            }).join('');

            return `<div class="example-box"><h4>${ex.title}</h4>${lines}</div>`;
        }).join('');

        examplesSection.innerHTML = `
            <h2>Example Gameplay</h2>
            ${examples}
        `;
    } else if (examplesSection) {
        examplesSection.style.display = 'none';
    }

    // Render installation section
    const installSection = document.getElementById('install-section');
    if (installSection && cmd.github) {
        installSection.innerHTML = `
            <h2>Installation</h2>
            <div class="info-box warning">
                <span class="icon">&#9888;</span>
                <div class="content">
                    <strong>Prerequisite:</strong> You must run <a href="config-setup.html">ConfigSetup.cs</a> first before installing this command.
                </div>
            </div>
            <div class="install-steps">
                <div class="install-step">
                    <div class="install-step-content">
                        <h3>Create a new C# action in StreamerBot</h3>
                        <p>Go to Actions → Add → Create new action</p>
                    </div>
                </div>
                <div class="install-step">
                    <div class="install-step-content">
                        <h3>Copy the command code</h3>
                        <p>Get the file from <a href="${cmd.github}" target="_blank">GitHub</a></p>
                    </div>
                </div>
                <div class="install-step">
                    <div class="install-step-content">
                        <h3>Set the trigger</h3>
                        <p>Add a chat command trigger${cmd.command ? ` with <code>${cmd.command}</code>` : ''}</p>
                    </div>
                </div>
                <div class="install-step">
                    <div class="install-step-content">
                        <h3>Test in chat</h3>
                        <p>Try the command to verify it works!</p>
                    </div>
                </div>
            </div>
        `;
    } else if (installSection) {
        installSection.style.display = 'none';
    }

    // Render related commands section
    const relatedSection = document.getElementById('related-section');
    if (relatedSection && cmd.related && cmd.related.length > 0) {
        let related = cmd.related.map(r => {
            const relCmd = commandsData[r];
            if (relCmd) {
                return `
                    <a href="${r}.html" class="related-card">
                        <h4>${relCmd.command || relCmd.name}</h4>
                        <p>${relCmd.name}</p>
                    </a>
                `;
            }
            return '';
        }).join('');

        relatedSection.innerHTML = `
            <h2>Related Commands</h2>
            <div class="related-grid">${related}</div>
        `;
    } else if (relatedSection) {
        relatedSection.style.display = 'none';
    }
}
