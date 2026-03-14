const { StaffModel } = require('../../database/models');
const config = require('../../../config.json');

async function isStaff(interaction) {
    try {
        const supportGuild = interaction.client.guilds.cache.get(config.supportServer.id);
        if (!supportGuild) return false;

        const member = await supportGuild.members.fetch(interaction.user.id).catch(() => null);
        if (!member) return false;

        const hasDevRole = member.roles.cache.has(config.supportServer.roles.developer);
        const hasStaffRole = member.roles.cache.has(config.supportServer.roles.staff);

        return hasDevRole || hasStaffRole;
    } catch (error) {
        console.error('Error checking staff status:', error);
        return false;
    }
}

async function isDeveloper(interaction) {
    try {
        const supportGuild = interaction.client.guilds.cache.get(config.supportServer.id);
        if (!supportGuild) return false;

        const member = await supportGuild.members.fetch(interaction.user.id).catch(() => null);
        if (!member) return false;

        return member.roles.cache.has(config.supportServer.roles.developer);
    } catch (error) {
        console.error('Error checking developer status:', error);
        return false;
    }
}

function isOwner(userId) {
    return userId === process.env.OWNER_ID;
}

module.exports = { isStaff, isDeveloper, isOwner };
