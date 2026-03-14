const { StaffModel } = require('../../database/models');
const config = require('../../../config.json');

// Safe console logging to prevent EPIPE errors in background processes
function safeLog(...args) {
    try {
        console.log(...args);
    } catch (err) {
        // Silently ignore EPIPE errors when stdout is unavailable
    }
}

function safeError(...args) {
    try {
        console.error(...args);
    } catch (err) {
        // Silently ignore EPIPE errors when stderr is unavailable
    }
}

async function updateStaffRoles(client, broadcastCallback) {
    try {
        const supportGuild = client.guilds.cache.get(config.supportServer.id);
        if (!supportGuild) {
            safeLog('Support server not found');
            return null;
        }

        await supportGuild.members.fetch();

        const developerRole = supportGuild.roles.cache.get(config.supportServer.roles.developer);
        const staffRole = supportGuild.roles.cache.get(config.supportServer.roles.staff);

        // Track who should be staff
        const validStaffIds = new Set();

        if (developerRole) {
            for (const [memberId, member] of developerRole.members) {
                // Skip bots
                if (member.user.bot) continue;

                validStaffIds.add(memberId);

                const avatarUrl = member.user.displayAvatarURL({ size: 128, extension: 'png' });
                const displayName = member.user.globalName || member.user.username;
                StaffModel.add(memberId, member.displayName, 'Developer', avatarUrl);

                // Also update the user record to ensure display name is current
                const { UserModel } = require('../../database/models');
                const user = UserModel.findByDiscordId(memberId);
                if (user) {
                    UserModel.create(memberId, displayName); // Updates on conflict
                }
            }
        }

        if (staffRole) {
            for (const [memberId, member] of staffRole.members) {
                // Skip bots
                if (member.user.bot) continue;

                if (!developerRole || !member.roles.cache.has(config.supportServer.roles.developer)) {
                    validStaffIds.add(memberId);

                    const avatarUrl = member.user.displayAvatarURL({ size: 128, extension: 'png' });
                    const displayName = member.user.globalName || member.user.username;
                    StaffModel.add(memberId, member.displayName, 'Staff', avatarUrl);

                    // Also update the user record to ensure display name is current
                    const { UserModel } = require('../../database/models');
                    const user = UserModel.findByDiscordId(memberId);
                    if (user) {
                        UserModel.create(memberId, displayName); // Updates on conflict
                    }
                }
            }
        }

        // Remove staff members who no longer have the roles
        const currentStaff = StaffModel.getAll();
        for (const staff of currentStaff) {
            if (!validStaffIds.has(staff.discord_id)) {
                safeLog(`Removing ${staff.username} from staff (no longer has role)`);
                StaffModel.remove(staff.discord_id);
            }
        }

        const allStaff = StaffModel.getAll();

        if (broadcastCallback && typeof broadcastCallback === 'function') {
            broadcastCallback(allStaff);
        }

        safeLog('Staff roles updated successfully');
        return allStaff;
    } catch (error) {
        safeError('Error updating staff roles:', error);
        return null;
    }
}

function checkStaffRole(req, res, next) {
    const userId = req.headers['x-user-id'];

    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const staff = StaffModel.findByDiscordId(userId);

    if (!staff) {
        return res.status(403).json({ error: 'Forbidden - Staff access required' });
    }

    req.staff = staff;
    next();
}

module.exports = { updateStaffRoles, checkStaffRole };
