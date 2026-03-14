const { GuildModel, UserModel } = require('../../database/models');
const { db } = require('../../database/schema');

/**
 * GuildService - Handles all guild-related game logic
 *
 * Dual-platform service that can be called from both Discord and Web
 */
class GuildService {
    /**
     * Get guild bonus multiplier for a user (5% per guild level)
     * @param {string} userDiscordId - Discord ID of the user
     * @returns {number} Bonus multiplier (1.0 = no bonus, 1.05 = 5% bonus, etc.)
     */
    static getGuildBonus(userDiscordId) {
        try {
            const user = UserModel.findByDiscordId(userDiscordId);
            if (!user) return 1.0;

            const userGuild = GuildModel.getUserGuild(user.id);
            if (!userGuild) return 1.0;

            const guild = GuildModel.findById(userGuild.id);
            if (!guild) return 1.0;

            // 5% bonus per guild level
            const bonusPercent = guild.level * 5;
            return 1 + (bonusPercent / 100);
        } catch (error) {
            console.error('Error getting guild bonus:', error);
            return 1.0;
        }
    }

    /**
     * Get detailed guild bonus info for display
     * @param {string} userDiscordId - Discord ID of the user
     * @returns {Object} Bonus information
     */
    static getGuildBonusInfo(userDiscordId) {
        try {
            const user = UserModel.findByDiscordId(userDiscordId);
            if (!user) return { hasGuild: false, bonus: 0, multiplier: 1.0 };

            const userGuild = GuildModel.getUserGuild(user.id);
            if (!userGuild) return { hasGuild: false, bonus: 0, multiplier: 1.0 };

            const guild = GuildModel.findById(userGuild.id);
            if (!guild) return { hasGuild: false, bonus: 0, multiplier: 1.0 };

            const bonusPercent = guild.level * 5;
            return {
                hasGuild: true,
                guildName: guild.name,
                guildLevel: guild.level,
                bonus: bonusPercent,
                multiplier: 1 + (bonusPercent / 100)
            };
        } catch (error) {
            console.error('Error getting guild bonus info:', error);
            return { hasGuild: false, bonus: 0, multiplier: 1.0 };
        }
    }
    /**
     * Create a new guild
     * @param {string} creatorDiscordId - Discord ID of the guild creator
     * @param {string} guildName - Name of the guild
     * @param {string} guildTag - Short tag for the guild (3-5 chars)
     * @param {string} description - Guild description
     * @param {string} serverId - Discord server ID where guild is based
     * @param {boolean} isPublic - Whether the guild is public (anyone can join) or invite-only
     * @param {string} source - 'discord' or 'web'
     * @returns {Promise<Object>} Result object
     */
    static async createGuild(creatorDiscordId, guildName, guildTag, description, serverId, isPublic = false, source = 'discord') {
        try {
            // Validate inputs
            if (!guildName || guildName.length < 3 || guildName.length > 32) {
                return {
                    success: false,
                    error: 'Guild name must be between 3 and 32 characters'
                };
            }

            if (!guildTag || guildTag.length < 2 || guildTag.length > 5) {
                return {
                    success: false,
                    error: 'Guild tag must be between 2 and 5 characters'
                };
            }

            // Check if user exists
            const creator = UserModel.findByDiscordId(creatorDiscordId);
            if (!creator) {
                return {
                    success: false,
                    error: 'User not found'
                };
            }

            // Check if user has enough currency (100,000 Dakari to create a guild)
            const GUILD_CREATION_COST = 100000;
            if (creator.currency < GUILD_CREATION_COST) {
                return {
                    success: false,
                    error: `You need ${GUILD_CREATION_COST.toLocaleString()} Dakari to create a guild (you have ${creator.currency.toLocaleString()})`
                };
            }

            // Check if user is already in a guild
            const existingGuild = GuildModel.getUserGuild(creator.id);
            if (existingGuild) {
                return {
                    success: false,
                    error: `You are already in a guild: ${existingGuild.name}`
                };
            }

            // Check if guild name is taken
            const existingNameGuild = GuildModel.findByName(guildName);
            if (existingNameGuild) {
                return {
                    success: false,
                    error: 'A guild with this name already exists'
                };
            }

            // Check if guild tag is taken
            const existingTagGuild = GuildModel.findByTag(guildTag);
            if (existingTagGuild) {
                return {
                    success: false,
                    error: 'A guild with this tag already exists'
                };
            }

            // Deduct currency from creator
            const stmt = db.prepare('UPDATE users SET currency = currency - ? WHERE id = ?');
            stmt.run(GUILD_CREATION_COST, creator.id);

            // Create guild
            const result = GuildModel.create(guildName, guildTag.toUpperCase(), description, creator.id, serverId, isPublic);

            // Add creator as leader
            GuildModel.addMember(result.lastInsertRowid, creator.id, 'leader');

            // Log activity
            this.logGuildActivity(result.lastInsertRowid, 'guild_created', `${creator.username} created the guild`, creator.id);

            return {
                success: true,
                message: `Guild "${guildName}" [${guildTag.toUpperCase()}] has been created!`,
                data: {
                    guildId: result.lastInsertRowid,
                    name: guildName,
                    tag: guildTag.toUpperCase()
                }
            };
        } catch (error) {
            console.error('Error creating guild:', error);
            return {
                success: false,
                error: 'Failed to create guild'
            };
        }
    }

    /**
     * Invite a user to a guild
     * @param {string} inviterDiscordId - Discord ID of the inviter
     * @param {string} inviteeDiscordId - Discord ID of the invitee
     * @param {string} source - 'discord' or 'web'
     * @returns {Promise<Object>} Result object
     */
    static async inviteUser(inviterDiscordId, inviteeDiscordId, source = 'discord') {
        try {
            const inviter = UserModel.findByDiscordId(inviterDiscordId);
            const invitee = UserModel.findByDiscordId(inviteeDiscordId);

            if (!inviter || !invitee) {
                return {
                    success: false,
                    error: 'User not found'
                };
            }

            // Get inviter's guild
            const guild = GuildModel.getUserGuild(inviter.id);
            if (!guild) {
                return {
                    success: false,
                    error: 'You are not in a guild'
                };
            }

            // Check if inviter has permission (leader or officer)
            if (guild.role !== 'leader' && guild.role !== 'officer') {
                return {
                    success: false,
                    error: 'Only guild leaders and officers can invite members'
                };
            }

            // Check if invitee is already in a guild
            const inviteeGuild = GuildModel.getUserGuild(invitee.id);
            if (inviteeGuild) {
                return {
                    success: false,
                    error: `${invitee.username} is already in a guild`
                };
            }

            // Check if guild is full
            const memberCount = GuildModel.getMemberCount(guild.id);
            if (memberCount >= guild.max_members) {
                return {
                    success: false,
                    error: 'Your guild is full'
                };
            }

            // Create invite (expires in 7 days)
            const expiresAt = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60);
            GuildModel.createInvite(guild.id, inviter.id, invitee.id, expiresAt);

            // Log activity
            this.logGuildActivity(guild.id, 'invite_sent', `${inviter.username} invited ${invitee.username}`, inviter.id);

            return {
                success: true,
                message: `Invited ${invitee.username} to join ${guild.name}`,
                data: {
                    guildName: guild.name,
                    inviteeName: invitee.username
                }
            };
        } catch (error) {
            console.error('Error inviting user:', error);
            return {
                success: false,
                error: 'Failed to send invite'
            };
        }
    }

    /**
     * Join a guild (accept invite)
     * @param {string} userDiscordId - Discord ID of the user
     * @param {number} inviteId - ID of the invite
     * @param {string} source - 'discord' or 'web'
     * @returns {Promise<Object>} Result object
     */
    static async joinGuild(userDiscordId, inviteId, source = 'discord') {
        try {
            const user = UserModel.findByDiscordId(userDiscordId);
            if (!user) {
                return {
                    success: false,
                    error: 'User not found'
                };
            }

            // Check if user is already in a guild
            const existingGuild = GuildModel.getUserGuild(user.id);
            if (existingGuild) {
                return {
                    success: false,
                    error: `You are already in a guild: ${existingGuild.name}`
                };
            }

            // Get pending invites
            const invites = GuildModel.getPendingInvites(user.id);
            const invite = invites.find(inv => inv.id === inviteId);

            if (!invite) {
                return {
                    success: false,
                    error: 'Invite not found or expired'
                };
            }

            // Check if guild is full
            const memberCount = GuildModel.getMemberCount(invite.guild_id);
            const guild = GuildModel.findById(invite.guild_id);
            if (memberCount >= guild.max_members) {
                return {
                    success: false,
                    error: 'Guild is full'
                };
            }

            // Add user to guild
            GuildModel.addMember(invite.guild_id, user.id, 'member');

            // Mark invite as accepted
            GuildModel.updateInviteStatus(inviteId, 'accepted');

            // Log activity
            this.logGuildActivity(guild.id, 'member_join', `${user.username} joined the guild`, user.id);

            return {
                success: true,
                message: `You have joined ${guild.name}!`,
                data: {
                    guildId: guild.id,
                    guildName: guild.name,
                    guildTag: guild.tag
                }
            };
        } catch (error) {
            console.error('Error joining guild:', error);
            return {
                success: false,
                error: 'Failed to join guild'
            };
        }
    }

    /**
     * Join a public guild directly (no invite needed)
     * @param {string} userDiscordId - Discord ID of the user
     * @param {number} guildId - ID of the guild to join
     * @param {string} source - 'discord' or 'web'
     * @returns {Promise<Object>} Result object
     */
    static async joinPublicGuild(userDiscordId, guildId, source = 'discord') {
        try {
            const user = UserModel.findByDiscordId(userDiscordId);
            if (!user) {
                return {
                    success: false,
                    error: 'User not found'
                };
            }

            // Check if user is already in a guild
            const existingGuild = GuildModel.getUserGuild(user.id);
            if (existingGuild) {
                return {
                    success: false,
                    error: `You are already in a guild: ${existingGuild.name}`
                };
            }

            // Get guild info
            const guild = GuildModel.findById(guildId);
            if (!guild) {
                return {
                    success: false,
                    error: 'Guild not found'
                };
            }

            // Check if guild is public
            if (!guild.public) {
                return {
                    success: false,
                    error: 'This guild is invite-only. You need an invite to join.'
                };
            }

            // Check if guild is full
            const memberCount = GuildModel.getMemberCount(guildId);
            if (memberCount >= guild.max_members) {
                return {
                    success: false,
                    error: 'Guild is full'
                };
            }

            // Add user to guild
            GuildModel.addMember(guildId, user.id, 'member');

            // Log activity
            this.logGuildActivity(guildId, 'member_join', `${user.username} joined the guild`, user.id);

            return {
                success: true,
                message: `You have joined ${guild.name}!`,
                data: {
                    guildId: guild.id,
                    guildName: guild.name,
                    guildTag: guild.tag
                }
            };
        } catch (error) {
            console.error('Error joining public guild:', error);
            return {
                success: false,
                error: 'Failed to join guild'
            };
        }
    }

    /**
     * Leave a guild
     * @param {string} userDiscordId - Discord ID of the user
     * @param {string} source - 'discord' or 'web'
     * @returns {Promise<Object>} Result object
     */
    static async leaveGuild(userDiscordId, source = 'discord') {
        try {
            const user = UserModel.findByDiscordId(userDiscordId);
            if (!user) {
                return {
                    success: false,
                    error: 'User not found'
                };
            }

            const guild = GuildModel.getUserGuild(user.id);
            if (!guild) {
                return {
                    success: false,
                    error: 'You are not in a guild'
                };
            }

            // Leaders cannot leave - they must transfer leadership or disband
            if (guild.role === 'leader') {
                return {
                    success: false,
                    error: 'Guild leaders cannot leave. Transfer leadership or disband the guild instead.'
                };
            }

            // Remove member
            GuildModel.removeMember(guild.id, user.id);

            // Log activity
            this.logGuildActivity(guild.id, 'member_leave', `${user.username} left the guild`, user.id);

            return {
                success: true,
                message: `You have left ${guild.name}`,
                data: {
                    guildName: guild.name
                }
            };
        } catch (error) {
            console.error('Error leaving guild:', error);
            return {
                success: false,
                error: 'Failed to leave guild'
            };
        }
    }

    /**
     * Get guild information
     * @param {number} guildId - Guild ID
     * @param {string} source - 'discord' or 'web'
     * @returns {Promise<Object>} Result object
     */
    static async getGuildInfo(guildId, source = 'discord') {
        try {
            const guild = GuildModel.findById(guildId);
            if (!guild) {
                return {
                    success: false,
                    error: 'Guild not found'
                };
            }

            const members = GuildModel.getMembers(guildId);
            const memberCount = members.length;

            return {
                success: true,
                data: {
                    ...guild,
                    memberCount,
                    members
                }
            };
        } catch (error) {
            console.error('Error getting guild info:', error);
            return {
                success: false,
                error: 'Failed to get guild information'
            };
        }
    }

    /**
     * Contribute to guild treasury
     * @param {string} userDiscordId - Discord ID of the user
     * @param {number} currency - Amount of currency to contribute
     * @param {number} gems - Amount of gems to contribute
     * @param {string} source - 'discord' or 'web'
     * @returns {Promise<Object>} Result object
     */
    static async contributeToGuild(userDiscordId, currency = 0, gems = 0, source = 'discord') {
        try {
            const user = UserModel.findByDiscordId(userDiscordId);
            if (!user) {
                return {
                    success: false,
                    error: 'User not found'
                };
            }

            const guild = GuildModel.getUserGuild(user.id);
            if (!guild) {
                return {
                    success: false,
                    error: 'You are not in a guild'
                };
            }

            // Check if user has enough resources
            if (currency > user.currency || gems > user.gems) {
                return {
                    success: false,
                    error: 'Insufficient resources'
                };
            }

            // Deduct from user and add to guild
            const stmt = db.prepare(`
                UPDATE users
                SET currency = currency - ?, gems = gems - ?
                WHERE id = ?
            `);
            stmt.run(currency, gems, user.id);

            GuildModel.updateTreasury(guild.id, currency, gems);
            GuildModel.addContribution(guild.id, user.id, currency, gems);

            // Log activity
            const contributionParts = [];
            if (currency > 0) contributionParts.push(`${currency.toLocaleString()} Dakari`);
            if (gems > 0) contributionParts.push(`${gems.toLocaleString()} Gems`);
            this.logGuildActivity(guild.id, 'contribution', `${user.username} contributed ${contributionParts.join(' and ')}`, user.id);

            return {
                success: true,
                message: `Contributed ${currency} Dakari and ${gems} Gems to ${guild.name}`,
                data: {
                    currency,
                    gems
                }
            };
        } catch (error) {
            console.error('Error contributing to guild:', error);
            return {
                success: false,
                error: 'Failed to contribute to guild'
            };
        }
    }

    /**
     * Upgrade guild max members (adds 5 slots for 1000 gems from treasury)
     * @param {string} leaderDiscordId - Discord ID of the guild leader
     * @param {string} source - 'discord' or 'web'
     * @returns {Promise<Object>} Result object
     */
    static async upgradeMaxMembers(leaderDiscordId, source = 'discord') {
        try {
            const leader = UserModel.findByDiscordId(leaderDiscordId);
            if (!leader) {
                return {
                    success: false,
                    error: 'User not found'
                };
            }

            const userGuild = GuildModel.getUserGuild(leader.id);
            if (!userGuild) {
                return {
                    success: false,
                    error: 'You are not in a guild'
                };
            }

            // Only leader can upgrade
            if (userGuild.role !== 'leader') {
                return {
                    success: false,
                    error: 'Only the guild leader can upgrade member slots'
                };
            }

            const guild = GuildModel.findById(userGuild.id);
            const SLOT_COST = 1000; // 1000 gems per 5 slots
            const SLOT_INCREMENT = 5;

            // Check if guild has enough gems in treasury
            if (guild.treasury_gems < SLOT_COST) {
                return {
                    success: false,
                    error: `Not enough gems in guild treasury. Need ${SLOT_COST} gems, have ${guild.treasury_gems} gems.`
                };
            }

            // Deduct gems from treasury and increase max_members
            const stmt = db.prepare(`
                UPDATE guilds
                SET treasury_gems = treasury_gems - ?,
                    max_members = max_members + ?,
                    updated_at = strftime('%s', 'now')
                WHERE id = ?
            `);
            stmt.run(SLOT_COST, SLOT_INCREMENT, guild.id);

            return {
                success: true,
                message: `Guild member slots upgraded! +${SLOT_INCREMENT} slots (now ${guild.max_members + SLOT_INCREMENT} max members)`,
                data: {
                    newMaxMembers: guild.max_members + SLOT_INCREMENT,
                    gemsCost: SLOT_COST,
                    remainingGems: guild.treasury_gems - SLOT_COST
                }
            };
        } catch (error) {
            console.error('Error upgrading max members:', error);
            return {
                success: false,
                error: 'Failed to upgrade member slots'
            };
        }
    }

    /**
     * Upgrade guild level (cost = current_level * 1000 gems from treasury)
     * Maximum level: 999
     * @param {string} leaderDiscordId - Discord ID of the guild leader
     * @param {string} source - 'discord' or 'web'
     * @returns {Promise<Object>} Result object
     */
    static async upgradeGuildLevel(leaderDiscordId, source = 'discord') {
        try {
            const MAX_GUILD_LEVEL = 999;

            const leader = UserModel.findByDiscordId(leaderDiscordId);
            if (!leader) {
                return {
                    success: false,
                    error: 'User not found'
                };
            }

            const userGuild = GuildModel.getUserGuild(leader.id);
            if (!userGuild) {
                return {
                    success: false,
                    error: 'You are not in a guild'
                };
            }

            // Only leader can upgrade
            if (userGuild.role !== 'leader') {
                return {
                    success: false,
                    error: 'Only the guild leader can upgrade the guild level'
                };
            }

            const guild = GuildModel.findById(userGuild.id);

            // Check if max level reached
            if (guild.level >= MAX_GUILD_LEVEL) {
                return {
                    success: false,
                    error: `Guild is already at maximum level (${MAX_GUILD_LEVEL})`
                };
            }

            const levelCost = guild.level * 1000; // Level 1->2: 1000, Level 2->3: 2000, etc.

            // Check if guild has enough gems in treasury
            if (guild.treasury_gems < levelCost) {
                return {
                    success: false,
                    error: `Not enough gems in guild treasury. Need ${levelCost.toLocaleString()} gems, have ${guild.treasury_gems.toLocaleString()} gems.`
                };
            }

            // Deduct gems from treasury and increase level
            const stmt = db.prepare(`
                UPDATE guilds
                SET treasury_gems = treasury_gems - ?,
                    level = level + 1,
                    updated_at = strftime('%s', 'now')
                WHERE id = ?
            `);
            stmt.run(levelCost, guild.id);

            const newLevel = guild.level + 1;
            const bonusPercent = newLevel * 5; // 5% bonus per level

            // Log activity
            this.logGuildActivity(guild.id, 'level_up', `Guild leveled up to Level ${newLevel} (+${bonusPercent}% bonus)`, leader.id);

            return {
                success: true,
                message: `Guild upgraded to Level ${newLevel}! All members gain +${bonusPercent}% bonus to stats and rewards!`,
                data: {
                    newLevel,
                    gemsCost: levelCost,
                    remainingGems: guild.treasury_gems - levelCost,
                    bonusPercent
                }
            };
        } catch (error) {
            console.error('Error upgrading guild level:', error);
            return {
                success: false,
                error: 'Failed to upgrade guild level'
            };
        }
    }

    /**
     * Kick a member from the guild (leader only)
     * @param {string} leaderDiscordId - Discord ID of the guild leader
     * @param {string} memberDiscordId - Discord ID of the member to kick
     * @param {string} source - 'discord' or 'web'
     * @returns {Promise<Object>} Result object
     */
    static async kickMember(leaderDiscordId, memberDiscordId, source = 'discord') {
        try {
            const leader = UserModel.findByDiscordId(leaderDiscordId);
            const member = UserModel.findByDiscordId(memberDiscordId);

            if (!leader || !member) {
                return {
                    success: false,
                    error: 'User not found'
                };
            }

            // Get leader's guild
            const leaderGuild = GuildModel.getUserGuild(leader.id);
            if (!leaderGuild) {
                return {
                    success: false,
                    error: 'You are not in a guild'
                };
            }

            // Check if user is leader
            if (leaderGuild.role !== 'leader') {
                return {
                    success: false,
                    error: 'Only the guild leader can kick members'
                };
            }

            // Get member's guild
            const memberGuild = GuildModel.getUserGuild(member.id);
            if (!memberGuild || memberGuild.id !== leaderGuild.id) {
                return {
                    success: false,
                    error: 'This user is not in your guild'
                };
            }

            // Cannot kick yourself
            if (leaderDiscordId === memberDiscordId) {
                return {
                    success: false,
                    error: 'You cannot kick yourself. Use /guild leave to leave the guild.'
                };
            }

            // Cannot kick the leader
            if (memberGuild.role === 'leader') {
                return {
                    success: false,
                    error: 'Cannot kick the guild leader'
                };
            }

            // Remove member from guild
            GuildModel.removeMember(leaderGuild.id, member.id);

            // Log activity
            this.logGuildActivity(leaderGuild.id, 'member_kick', `${member.username} was kicked by ${leader.username}`, leader.id);

            return {
                success: true,
                message: `${member.username} has been kicked from the guild`,
                data: {
                    kickedUser: member.username,
                    guildName: leaderGuild.name
                }
            };
        } catch (error) {
            console.error('Error kicking member:', error);
            return {
                success: false,
                error: 'Failed to kick member'
            };
        }
    }

    /**
     * Promote a member to officer (leader only)
     * @param {string} leaderDiscordId - Discord ID of the guild leader
     * @param {string} memberDiscordId - Discord ID of the member to promote
     * @param {string} source - 'discord' or 'web'
     * @returns {Promise<Object>} Result object
     */
    static async promoteMember(leaderDiscordId, memberDiscordId, source = 'discord') {
        try {
            const leader = UserModel.findByDiscordId(leaderDiscordId);
            const member = UserModel.findByDiscordId(memberDiscordId);

            if (!leader || !member) {
                return {
                    success: false,
                    error: 'User not found'
                };
            }

            // Get leader's guild
            const leaderGuild = GuildModel.getUserGuild(leader.id);
            if (!leaderGuild) {
                return {
                    success: false,
                    error: 'You are not in a guild'
                };
            }

            // Check if user is leader
            if (leaderGuild.role !== 'leader') {
                return {
                    success: false,
                    error: 'Only the guild leader can promote members'
                };
            }

            // Get member's guild
            const memberGuild = GuildModel.getUserGuild(member.id);
            if (!memberGuild || memberGuild.id !== leaderGuild.id) {
                return {
                    success: false,
                    error: 'This user is not in your guild'
                };
            }

            // Check current role
            if (memberGuild.role === 'officer') {
                return {
                    success: false,
                    error: `${member.username} is already an officer`
                };
            }

            if (memberGuild.role === 'leader') {
                return {
                    success: false,
                    error: 'Cannot promote the guild leader'
                };
            }

            // Promote member
            GuildModel.updateMemberRole(leaderGuild.id, member.id, 'officer');

            // Log activity
            this.logGuildActivity(leaderGuild.id, 'promotion', `${member.username} was promoted to Officer by ${leader.username}`, leader.id);

            return {
                success: true,
                message: `${member.username} has been promoted to officer`,
                data: {
                    promotedUser: member.username,
                    newRole: 'officer',
                    guildName: leaderGuild.name
                }
            };
        } catch (error) {
            console.error('Error promoting member:', error);
            return {
                success: false,
                error: 'Failed to promote member'
            };
        }
    }

    /**
     * Demote an officer to member (leader only)
     * @param {string} leaderDiscordId - Discord ID of the guild leader
     * @param {string} officerDiscordId - Discord ID of the officer to demote
     * @param {string} source - 'discord' or 'web'
     * @returns {Promise<Object>} Result object
     */
    static async demoteMember(leaderDiscordId, officerDiscordId, source = 'discord') {
        try {
            const leader = UserModel.findByDiscordId(leaderDiscordId);
            const officer = UserModel.findByDiscordId(officerDiscordId);

            if (!leader || !officer) {
                return {
                    success: false,
                    error: 'User not found'
                };
            }

            // Get leader's guild
            const leaderGuild = GuildModel.getUserGuild(leader.id);
            if (!leaderGuild) {
                return {
                    success: false,
                    error: 'You are not in a guild'
                };
            }

            // Check if user is leader
            if (leaderGuild.role !== 'leader') {
                return {
                    success: false,
                    error: 'Only the guild leader can demote officers'
                };
            }

            // Get officer's guild
            const officerGuild = GuildModel.getUserGuild(officer.id);
            if (!officerGuild || officerGuild.id !== leaderGuild.id) {
                return {
                    success: false,
                    error: 'This user is not in your guild'
                };
            }

            // Check current role
            if (officerGuild.role !== 'officer') {
                return {
                    success: false,
                    error: `${officer.username} is not an officer`
                };
            }

            // Demote officer
            GuildModel.updateMemberRole(leaderGuild.id, officer.id, 'member');

            // Log activity
            this.logGuildActivity(leaderGuild.id, 'demotion', `${officer.username} was demoted to Member by ${leader.username}`, leader.id);

            return {
                success: true,
                message: `${officer.username} has been demoted to member`,
                data: {
                    demotedUser: officer.username,
                    newRole: 'member',
                    guildName: leaderGuild.name
                }
            };
        } catch (error) {
            console.error('Error demoting member:', error);
            return {
                success: false,
                error: 'Failed to demote member'
            };
        }
    }

    /**
     * Update guild settings (leader only)
     * @param {string} leaderDiscordId - Discord ID of the guild leader
     * @param {Object} settings - Settings to update
     * @param {string} source - 'discord' or 'web'
     * @returns {Promise<Object>} Result object
     */
    static async updateGuildSettings(leaderDiscordId, settings = {}, source = 'discord') {
        try {
            const leader = UserModel.findByDiscordId(leaderDiscordId);
            if (!leader) {
                return {
                    success: false,
                    error: 'User not found'
                };
            }

            // Get leader's guild
            const leaderGuild = GuildModel.getUserGuild(leader.id);
            if (!leaderGuild) {
                return {
                    success: false,
                    error: 'You are not in a guild'
                };
            }

            // Check if user is leader
            if (leaderGuild.role !== 'leader') {
                return {
                    success: false,
                    error: 'Only the guild leader can update guild settings'
                };
            }

            const updates = {};
            let changesMade = false;

            // Update description
            if (settings.description !== undefined) {
                if (settings.description.length > 200) {
                    return {
                        success: false,
                        error: 'Description must be 200 characters or less'
                    };
                }
                updates.description = settings.description;
                changesMade = true;
            }

            // Update public status
            if (settings.isPublic !== undefined) {
                updates.public = settings.isPublic ? 1 : 0;
                changesMade = true;
            }

            if (!changesMade) {
                return {
                    success: false,
                    error: 'No settings to update'
                };
            }

            // Update guild
            GuildModel.updateGuild(leaderGuild.id, updates);

            // Log activity
            const changesDesc = [];
            if (updates.description !== undefined) changesDesc.push('description');
            if (updates.public !== undefined) changesDesc.push(updates.public ? 'made public' : 'made private');
            this.logGuildActivity(leaderGuild.id, 'settings_update', `${leader.username} updated guild settings (${changesDesc.join(', ')})`, leader.id);

            return {
                success: true,
                message: 'Guild settings updated successfully',
                data: {
                    guildId: leaderGuild.id,
                    updates
                }
            };
        } catch (error) {
            console.error('Error updating guild settings:', error);
            return {
                success: false,
                error: 'Failed to update guild settings'
            };
        }
    }

    /**
     * Disband a guild (leader only)
     * @param {string} leaderDiscordId - Discord ID of the guild leader
     * @param {string} source - 'discord' or 'web'
     * @returns {Promise<Object>} Result object
     */
    static async disbandGuild(leaderDiscordId, source = 'discord') {
        try {
            const leader = UserModel.findByDiscordId(leaderDiscordId);
            if (!leader) {
                return {
                    success: false,
                    error: 'User not found'
                };
            }

            // Get leader's guild
            const leaderGuild = GuildModel.getUserGuild(leader.id);
            if (!leaderGuild) {
                return {
                    success: false,
                    error: 'You are not in a guild'
                };
            }

            // Check if user is leader
            if (leaderGuild.role !== 'leader') {
                return {
                    success: false,
                    error: 'Only the guild leader can disband the guild'
                };
            }

            const guildName = leaderGuild.name;
            const memberCount = GuildModel.getMemberCount(leaderGuild.id);

            // Log activity before deletion
            this.logGuildActivity(leaderGuild.id, 'guild_disbanded', `${leader.username} disbanded the guild`, leader.id);

            // Delete guild
            GuildModel.deleteGuild(leaderGuild.id);

            return {
                success: true,
                message: `${guildName} has been disbanded`,
                data: {
                    guildName,
                    memberCount
                }
            };
        } catch (error) {
            console.error('Error disbanding guild:', error);
            return {
                success: false,
                error: 'Failed to disband guild'
            };
        }
    }

    /**
     * Transfer guild leadership to another member (leader only)
     * @param {string} currentLeaderDiscordId - Discord ID of the current guild leader
     * @param {string} newLeaderDiscordId - Discord ID of the new leader
     * @param {string} source - 'discord' or 'web'
     * @returns {Promise<Object>} Result object
     */
    static async transferLeadership(currentLeaderDiscordId, newLeaderDiscordId, source = 'discord') {
        try {
            const currentLeader = UserModel.findByDiscordId(currentLeaderDiscordId);
            const newLeader = UserModel.findByDiscordId(newLeaderDiscordId);

            if (!currentLeader || !newLeader) {
                return {
                    success: false,
                    error: 'User not found'
                };
            }

            // Cannot transfer to yourself
            if (currentLeaderDiscordId === newLeaderDiscordId) {
                return {
                    success: false,
                    error: 'You are already the guild leader'
                };
            }

            // Get current leader's guild
            const leaderGuild = GuildModel.getUserGuild(currentLeader.id);
            if (!leaderGuild) {
                return {
                    success: false,
                    error: 'You are not in a guild'
                };
            }

            // Check if user is leader
            if (leaderGuild.role !== 'leader') {
                return {
                    success: false,
                    error: 'Only the guild leader can transfer leadership'
                };
            }

            // Get new leader's guild membership
            const newLeaderGuild = GuildModel.getUserGuild(newLeader.id);
            if (!newLeaderGuild || newLeaderGuild.id !== leaderGuild.id) {
                return {
                    success: false,
                    error: 'The new leader must be a member of your guild'
                };
            }

            // Transfer leadership
            const guild = GuildModel.findById(leaderGuild.id);

            // Update guild leader
            GuildModel.updateGuild(leaderGuild.id, { leader_id: newLeader.id });

            // Update roles
            GuildModel.updateMemberRole(leaderGuild.id, currentLeader.id, 'member');
            GuildModel.updateMemberRole(leaderGuild.id, newLeader.id, 'leader');

            // Log activity
            this.logGuildActivity(leaderGuild.id, 'leadership_transfer', `Leadership transferred from ${currentLeader.username} to ${newLeader.username}`, currentLeader.id);

            return {
                success: true,
                message: `Leadership of ${guild.name} has been transferred to ${newLeader.username}`,
                data: {
                    guildName: guild.name,
                    oldLeader: currentLeader.username,
                    newLeader: newLeader.username
                }
            };
        } catch (error) {
            console.error('Error transferring leadership:', error);
            return {
                success: false,
                error: 'Failed to transfer leadership'
            };
        }
    }

    /**
     * Get guild activity log
     * @param {number} guildId - Guild ID
     * @param {number} limit - Number of entries to retrieve
     * @returns {Array} Activity log entries
     */
    static getGuildActivity(guildId, limit = 20) {
        try {
            const { db } = require('../../database/schema');
            const stmt = db.prepare(`
                SELECT * FROM guild_activity_log
                WHERE guild_id = ?
                ORDER BY created_at DESC
                LIMIT ?
            `);
            return stmt.all(guildId, limit);
        } catch (error) {
            console.error('Error getting guild activity:', error);
            return [];
        }
    }

    /**
     * Log guild activity
     * @param {number} guildId - Guild ID
     * @param {string} activityType - Type of activity
     * @param {string} description - Activity description
     * @param {number} userId - User ID who performed the action
     */
    static logGuildActivity(guildId, activityType, description, userId = null) {
        try {
            const { db } = require('../../database/schema');
            const stmt = db.prepare(`
                INSERT INTO guild_activity_log (guild_id, activity_type, description, user_id)
                VALUES (?, ?, ?, ?)
            `);
            stmt.run(guildId, activityType, description, userId);
        } catch (error) {
            console.error('Error logging guild activity:', error);
        }
    }

    /**
     * Create a guild announcement (leader or officer only)
     * @param {string} authorDiscordId - Discord ID of the announcement author
     * @param {string} title - Optional announcement title
     * @param {string} message - Announcement message
     * @param {string} source - 'discord' or 'web'
     * @returns {Promise<Object>} Result object
     */
    static async createAnnouncement(authorDiscordId, title, message, source = 'discord') {
        try {
            const author = UserModel.findByDiscordId(authorDiscordId);
            if (!author) {
                return {
                    success: false,
                    error: 'User not found'
                };
            }

            // Get author's guild
            const authorGuild = GuildModel.getUserGuild(author.id);
            if (!authorGuild) {
                return {
                    success: false,
                    error: 'You are not in a guild'
                };
            }

            // Check if author has permission (leader or officer)
            if (authorGuild.role !== 'leader' && authorGuild.role !== 'officer') {
                return {
                    success: false,
                    error: 'Only guild leaders and officers can create announcements'
                };
            }

            // Validate message
            if (!message || message.length < 1) {
                return {
                    success: false,
                    error: 'Announcement message cannot be empty'
                };
            }

            if (message.length > 500) {
                return {
                    success: false,
                    error: 'Announcement message must be 500 characters or less'
                };
            }

            // Validate title if provided
            if (title && title.length > 100) {
                return {
                    success: false,
                    error: 'Announcement title must be 100 characters or less'
                };
            }

            // Create announcement
            const { db } = require('../../database/schema');
            const stmt = db.prepare(`
                INSERT INTO guild_announcements (guild_id, author_id, title, message)
                VALUES (?, ?, ?, ?)
            `);
            const result = stmt.run(authorGuild.id, author.id, title || null, message);

            // Log activity
            this.logGuildActivity(authorGuild.id, 'announcement', `${author.username} posted an announcement${title ? `: ${title}` : ''}`, author.id);

            return {
                success: true,
                message: 'Announcement posted successfully',
                data: {
                    announcementId: result.lastInsertRowid,
                    guildName: authorGuild.name,
                    title,
                    message
                }
            };
        } catch (error) {
            console.error('Error creating announcement:', error);
            return {
                success: false,
                error: 'Failed to create announcement'
            };
        }
    }

    /**
     * Get guild announcements
     * @param {number} guildId - Guild ID
     * @param {number} limit - Number of announcements to retrieve
     * @returns {Array} Announcement list
     */
    static getGuildAnnouncements(guildId, limit = 10) {
        try {
            const { db } = require('../../database/schema');
            const stmt = db.prepare(`
                SELECT
                    a.*,
                    u.username as author_username
                FROM guild_announcements a
                JOIN users u ON a.author_id = u.id
                WHERE a.guild_id = ?
                ORDER BY a.created_at DESC
                LIMIT ?
            `);
            return stmt.all(guildId, limit);
        } catch (error) {
            console.error('Error getting guild announcements:', error);
            return [];
        }
    }

    /**
     * Delete a guild announcement (leader or announcement author only)
     * @param {string} userDiscordId - Discord ID of the user
     * @param {number} announcementId - Announcement ID
     * @param {string} source - 'discord' or 'web'
     * @returns {Promise<Object>} Result object
     */
    static async deleteAnnouncement(userDiscordId, announcementId, source = 'discord') {
        try {
            const user = UserModel.findByDiscordId(userDiscordId);
            if (!user) {
                return {
                    success: false,
                    error: 'User not found'
                };
            }

            // Get user's guild
            const userGuild = GuildModel.getUserGuild(user.id);
            if (!userGuild) {
                return {
                    success: false,
                    error: 'You are not in a guild'
                };
            }

            // Get announcement
            const { db } = require('../../database/schema');
            const announcement = db.prepare(`
                SELECT * FROM guild_announcements
                WHERE id = ? AND guild_id = ?
            `).get(announcementId, userGuild.id);

            if (!announcement) {
                return {
                    success: false,
                    error: 'Announcement not found'
                };
            }

            // Check permission (leader or announcement author)
            if (userGuild.role !== 'leader' && announcement.author_id !== user.id) {
                return {
                    success: false,
                    error: 'Only the announcement author or guild leader can delete announcements'
                };
            }

            // Delete announcement
            db.prepare('DELETE FROM guild_announcements WHERE id = ?').run(announcementId);

            // Log activity
            this.logGuildActivity(userGuild.id, 'announcement_delete', `${user.username} deleted an announcement`, user.id);

            return {
                success: true,
                message: 'Announcement deleted successfully'
            };
        } catch (error) {
            console.error('Error deleting announcement:', error);
            return {
                success: false,
                error: 'Failed to delete announcement'
            };
        }
    }
}

module.exports = GuildService;
