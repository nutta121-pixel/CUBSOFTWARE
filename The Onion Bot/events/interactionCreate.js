module.exports = {
    name: 'interactionCreate',
    async execute(interaction) {
        console.log(`[INTERACTION] Type: ${interaction.type}, Command: ${interaction.commandName || 'N/A'}, User: ${interaction.user.tag}`);

        // Handle slash commands
        if (interaction.isChatInputCommand()) {
            const command = interaction.client.commands.get(interaction.commandName);

            if (!command) {
                console.error(`[ERROR] No command matching ${interaction.commandName} was found.`);
                return;
            }

            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(`[ERROR] Error executing ${interaction.commandName}:`, error);
                const errorMessage = { content: 'There was an error while executing this command!', ephemeral: true };

                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(errorMessage);
                } else {
                    await interaction.reply(errorMessage);
                }
            }
        }
        // Handle context menu commands (user commands)
        else if (interaction.isUserContextMenuCommand()) {
            console.log(`[CONTEXT MENU] Command: ${interaction.commandName}, Target: ${interaction.targetUser.tag}`);
            const command = interaction.client.commands.get(interaction.commandName);

            if (!command) {
                console.error(`[ERROR] No context menu command matching ${interaction.commandName} was found.`);
                console.error(`[ERROR] Available commands:`, Array.from(interaction.client.commands.keys()));
                return;
            }

            console.log(`[CONTEXT MENU] Executing command: ${interaction.commandName}`);
            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(`[ERROR] Error executing context menu ${interaction.commandName}:`, error);
                const errorMessage = { content: 'There was an error while executing this command!', ephemeral: true };

                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(errorMessage);
                } else {
                    await interaction.reply(errorMessage);
                }
            }
        }
        // Handle button interactions
        else if (interaction.isButton()) {
            // Determine which command should handle this button based on customId
            let commandName;
            if (interaction.customId.startsWith('mute_')) {
                commandName = 'Mute User';
            } else if (interaction.customId.startsWith('unmute_')) {
                commandName = 'Unmute User';
            } else if (interaction.customId.startsWith('release_')) {
                commandName = 'Release from Confinement';
            }

            const command = commandName ? interaction.client.commands.get(commandName) : null;

            if (command && command.handleButton) {
                try {
                    await command.handleButton(interaction);
                } catch (error) {
                    console.error(`[ERROR] Error handling button interaction:`, error);
                    const errorMessage = { content: 'There was an error while processing this interaction!', ephemeral: true };

                    if (interaction.replied || interaction.deferred) {
                        await interaction.followUp(errorMessage);
                    } else {
                        await interaction.reply(errorMessage);
                    }
                }
            }
        }
        // Handle channel select menu interactions
        else if (interaction.isChannelSelectMenu()) {
            // Determine which command should handle this based on customId
            let commandName;
            if (interaction.customId.startsWith('block_channel_select_')) {
                commandName = 'Block from Voice Channel';
            } else if (interaction.customId.startsWith('confinement_channel_select_')) {
                commandName = 'Solitary Confinement';
            }

            const command = commandName ? interaction.client.commands.get(commandName) : null;

            if (command && command.handleChannelSelect) {
                try {
                    await command.handleChannelSelect(interaction);
                } catch (error) {
                    console.error(`[ERROR] Error handling channel select interaction:`, error);
                    const errorMessage = { content: 'There was an error while processing this interaction!', ephemeral: true };

                    if (interaction.replied || interaction.deferred) {
                        await interaction.followUp(errorMessage);
                    } else {
                        await interaction.reply(errorMessage);
                    }
                }
            }
        }
        // Handle string select menu interactions
        else if (interaction.isStringSelectMenu()) {
            // Determine which command should handle this based on customId
            let commandName;
            if (interaction.customId.startsWith('unblock_channel_select_')) {
                commandName = 'Unblock from Voice Channel';
            } else if (interaction.customId.startsWith('confinement_duration_select_')) {
                commandName = 'Solitary Confinement';
            }

            const command = commandName ? interaction.client.commands.get(commandName) : null;

            if (command && command.handleStringSelect) {
                try {
                    await command.handleStringSelect(interaction);
                } catch (error) {
                    console.error(`[ERROR] Error handling string select interaction:`, error);
                    const errorMessage = { content: 'There was an error while processing this interaction!', ephemeral: true };

                    if (interaction.replied || interaction.deferred) {
                        await interaction.followUp(errorMessage);
                    } else {
                        await interaction.reply(errorMessage);
                    }
                }
            }
        }
    }
};
