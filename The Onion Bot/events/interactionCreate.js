module.exports = {
    name: 'interactionCreate',
    async execute(interaction) {
        // Handle slash commands
        if (interaction.isChatInputCommand()) {
            const command = interaction.client.commands.get(interaction.commandName);
            const _start = Date.now();

            console.log(`[Command] /${interaction.commandName} by ${interaction.user.username} in ${interaction.guild?.name || 'DM'}`);

            if (!command) {
                console.error(`CUBSOFTWARE_ERROR_ONIONBOT_CMD_INTERACTION_173 — [Error] No command matching /${interaction.commandName}`);
                return;
            }

            try {
                await command.execute(interaction);
                const ms = Date.now() - _start;
                if (ms > 2000) console.log(`[Slow] /${interaction.commandName} took ${ms}ms in ${interaction.guild?.name || 'DM'}`);
            } catch (error) {
                console.error(`CUBSOFTWARE_ERROR_ONIONBOT_CMD_INTERACTION_173 — [Error] /${interaction.commandName} threw: ${error.message}`);
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
            const command = interaction.client.commands.get(interaction.commandName);
            console.log(`[Command] Context menu "${interaction.commandName}" by ${interaction.user.username} on ${interaction.targetUser?.tag || 'unknown'}`);

            if (!command) {
                console.error(`CUBSOFTWARE_ERROR_ONIONBOT_CMD_INTERACTION_173 — [Error] No context menu command matching "${interaction.commandName}"`);
                return;
            }

            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(`CUBSOFTWARE_ERROR_ONIONBOT_CMD_INTERACTION_173 — [Error] Context menu "${interaction.commandName}" threw: ${error.message}`);
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
            console.log(`[Button] ${interaction.customId} by ${interaction.user.username} in ${interaction.guild?.name || 'DM'}`);
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
                    console.error(`CUBSOFTWARE_ERROR_ONIONBOT_CMD_INTERACTION_173 — [Error] Button "${interaction.customId}" threw: ${error.message}`);
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
                    console.error(`CUBSOFTWARE_ERROR_ONIONBOT_CMD_INTERACTION_173 — [Error] Channel select "${interaction.customId}" threw: ${error.message}`);
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
                    console.error(`CUBSOFTWARE_ERROR_ONIONBOT_CMD_INTERACTION_173 — [Error] String select "${interaction.customId}" threw: ${error.message}`);
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
