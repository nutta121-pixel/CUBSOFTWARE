#Build clean me
import discord
import time
import asyncio
import datetime
import os
import json
import sqlite3
from dotenv import load_dotenv
from discord.ext import commands
from discord.utils import get
default_prefix = "."
load_dotenv()
BOT_OWNER_ID = int(os.getenv('OWNER_ID', '738723658352296017').split(',')[0].strip())
BOT_TOKEN_ID = os.getenv('BOT_TOKEN_ID') or os.getenv('GALAXY_BOT_TOKEN')
def load_users():
     try:
         with open('UserInfo.json', 'r') as f:
             return json.load(f)
     except FileNotFoundError:
         return {}
     except json.JSONDecodeError:
         return {}
def add_users(member):
    options = load_users()
    if str(member.id) not in options:
        print("not in options")
        options[str(member.id)] = {
        "name": member.name,
        "banned": False,
        "nickname": member.nick,
        "servers": [str(member.guild.id),]
        }
        print(f"New User {member.name} Created in Users File")
        save_user(options)
    if str(member.id) in options:
        if  str(member.guild.id) in options[str(member.id)]["servers"]:
            print(f"skipping {member.name} as already in system")
        else:
            options[str(member.id)]["servers"].append(str(member.guild.id))
            save_user(options)
            print("user info updated")
    else:
        print("option 3 fuck idk")
def load_settings():
     try:
         with open('Guildsettings.json', 'r') as f:
             return json.load(f)
     except FileNotFoundError:
         return {}
     except json.JSONDecodeError:
         return {}
def save_prefixes(prefixes_data):
    with open('Guildsettings.json', 'w') as f:
        json.dump(prefixes_data, f, indent=4)
def save_user(user_data):
    with open('UserInfo.json', 'w') as f:
        json.dump(user_data, f, indent=4)
def get_prefix(client, message):
    if message.guild:
        config = load_settings()
        return config.get(str(message.guild.id), {}).get("prefix", default_prefix)
    return default_prefix
client = commands.Bot(command_prefix=get_prefix, owner_id =BOT_OWNER_ID, case_insensitive=True, intents=discord.Intents.all())
print(f'bot owner is {BOT_OWNER_ID}')
timestamp = datetime.datetime.now()
stamp = timestamp.strftime("%I:%M %p")
longstamp = timestamp.strftime("%d/%m/%y    %I:%M %p")
#Buttons
class chView(discord.ui.View):
    def __init__(self, Log_cache):
        super().__init__(timeout=600)
        self.Log_cache = Log_cache
    @discord.ui.button(label="Undo!", style=discord.ButtonStyle.primary)
    async def undo_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        button.disabled = True
        button.style = discord.ButtonStyle.grey
        guild = interaction.guild
        channel = await guild.create_text_channel(name=self.Log_cache["name"], overwrites=self.Log_cache["overwrites"])
        await channel.edit(position=self.Log_cache["position"], category=self.Log_cache["category"],)
        await interaction.response.send_message(f"DONE , Channel : {self.Log_cache["name"]} Recreated", ephemeral=True, delete_after=10.0)
        await interaction.followup.edit_message(message_id=interaction.message.id, view=self)
class RView(discord.ui.View):
    def __init__(self, Log_cache):
        super().__init__(timeout=600)
        self.Log_cache = Log_cache
    @discord.ui.button(label="Undo!", style=discord.ButtonStyle.primary)
    async def undo_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        button.disabled=True
        guild = interaction.guild
        role = await guild.create_role(name=self.Log_cache["name"], permissions=self.Log_cache["overwrites"])
        await role.edit(position=self.Log_cache["position"])
        await interaction.response.send_message(f"DONE , Role : '{self.Log_cache["name"]}' Recreated!", ephemeral=True, view=self, delete_after=10.0)
        await interaction.followup.edit_message(message_id=interaction.message.id, view=self)
class MView(discord.ui.View):
    def __init__(self, Log_cache):
        super().__init__(timeout=600)
        self.Log_cache = Log_cache
    @discord.ui.button(label="Undo!", style=discord.ButtonStyle.primary)
    async def undo_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        fullstamp = self.Log_cache["time"].strftime("%I:%M %p - %d/%m/%y")
        if self.Log_cache["message"].content:
            button.disabled = True
            button.style = discord.ButtonStyle.grey
            embed = discord.Embed(title=f'', color=discord.Color.blue())
            embed.set_author(name=self.Log_cache["name"], icon_url=self.Log_cache["name"].display_avatar.url)
            embed.add_field(name="Message Restored", value=f"{self.Log_cache["overwrites"]}")
            embed.set_footer(text=f'Sent at: {fullstamp}')
            await self.Log_cache["position"].send(embed=embed)
            reply = discord.Embed(title='Done!!', color=discord.Color.blue())
            reply.set_footer(text=f'Message From: {self.Log_cache["name"]}\nResent Sucessfully\n{stamp}')
            await interaction.response.defer()
            await interaction.followup.send(embed=reply, ephemeral=True, delete_after=10.0)
            await interaction.followup.edit_message(message_id=interaction.message.id, view=self)
        else:
            button.disabled = True
            button.style = discord.ButtonStyle.grey
            embed = discord.Embed(title=f'', color=discord.Color.blue())
            embed.set_author(name=self.Log_cache["name"], icon_url=self.Log_cache["name"].display_avatar.url)
            embed.set_image(url=self.Log_cache["overwrites"].proxy_url)
            await self.Log_cache["position"].send(embed=embed)
            reply = discord.Embed(title='Done!!', color=discord.Color.blue())
            reply.set_footer(text=f'Message From: {self.Log_cache["name"]}\nResent Sucessfully\n{stamp}')
            await interaction.response.defer()
            await interaction.followup.send(embed=reply, ephemeral=True, delete_after=10.0)
            await interaction.followup.edit_message(message_id=interaction.message.id, view=self)
@client.command()
@commands.has_permissions(administrator=True)
async def add_all_users(ctx):
    for member in ctx.guild.members:
        try:
            add_users(member)
            print(f"adding:{member.name}")
        except Exception as e:
            print(f'could not process {member.name}: {e}')
    await ctx.send('all users finished being processed.')
#EVENTS
@client.event
async def on_member_join(member):
    options = load_users()
    if str(member.id) not in options:
        print("not in options")
        options[str(member.id)] = {
        "name": member.name,
        "banned": False,
        "nickname": member.nick,
        "servers": [str(member.guild.id),]
        }
        print(f"New User {member.name} Created in Users File")
        save_user(options)
    if str(member.id) in options:
        if  str(member.guild.id) in options[str(member.id)]["servers"]:
            print(f"skipping {member.name} as already in system")
        else:
            options[str(member.id)]["servers"].append(str(member.guild.id))
            save_user(options)
            print("user info updated")
    else:
        print(f"Existing User {member.name} Updated Users File")
@client.event
async def on_guild_join(guild):
    bans = [ban async for ban in guild.bans()]
    if not bans:
        banned_list = None
    else:
        banned_list = '\n'.join([f"{entry.user.name}#{entry.user.discriminator} (ID: {entry.user.id})" for entry in bans])
    options = load_settings()
    if str(guild.id) not in options:
        options[str(guild.id)] = {
            "prefix": ".",
            "welcome_channel": None,
            "mod_role_id": None,
            "logs_enabled": None,
            "user_role": None,
            "banned_users": banned_list,
        }
        save_prefixes(options)
        print("done")
@client.event
async def on_ready():
    print('startup complete')
@client.event
async def on_voice_state_update(member, before, after):
    log_channel = get(member.guild.channels, name="logs")
    if before.channel is None and after.channel is not None:
        if member.bot:
            return
        else:
            try:
                if after.channel.name == "Create Private Channel":
                    guild = member.guild
                    overwrites = {
                        guild.default_role: discord.PermissionOverwrite(view_channel=False, connect=False),
                        member: discord.PermissionOverwrite(view_channel=True, connect=True),
                        guild.me: discord.PermissionOverwrite(view_channel=True, connect=True)
                    }
                    channel = await guild.create_voice_channel(
                        name=f"{member.name}'s Private Channel",
                        overwrites=overwrites,
                        category=after.channel.category
                    )
                    await member.move_to(channel)
                embed = discord.Embed(title=f'', color=discord.Color.blue())
                embed.set_author(name=member.name, icon_url=member.display_avatar.url)
                embed.add_field(name='User Join Channel', value=f"{after.channel.name}" or 'Channel Not Found')
                embed.set_footer(text=f'{longstamp}')
                await log_channel.send(embed=embed)
                #await member.voice.channel.connect()
            except Exception as e:
                print(f"ERROR private channel creation {e}")
    elif after.channel is None and before.channel is not None:
        if member.bot:
            return
        else:
            if before.channel.name != "Create Private Channel":
                embed = discord.Embed(title=f'', color=discord.Color.blue())
                embed.set_author(name=member.name, icon_url=member.display_avatar.url)
                embed.add_field(name='User Left Channel', value=f"{before.channel.name}" or 'Channel Not Found')
                embed.set_footer(text=f'{longstamp}')
                await log_channel.send(embed=embed)
                    #await member.guild.voice_client.disconnect()
                if "'s Private Channel" in before.channel.name:
                    if len(before.channel.members) == 0:
                        try:
                            await before.channel.delete()
                        except Exception as e:
                            print(f"ERROR deleting channel {e}")
            else:
                return
    elif after.channel is not None and before.channel is not None:
        if member.bot:
            return
        else:
            if before.channel.name != "Create Private Channel":
                embed = discord.Embed(title=f'', color=discord.Color.blue())
                embed.set_author(name=member.name, icon_url=member.display_avatar.url)
                embed.add_field(name='User Changed Channel', value=f"{before.channel.name} -> {after.channel.name}" or 'Channel Not Found')
                embed.set_footer(text=f'{longstamp}')
                await log_channel.send(embed=embed)
                    #await member.guild.voice_client.disconnect()
                if "'s Private Channel" in before.channel.name:
                    if len(before.channel.members) == 0:
                        try:
                            await before.channel.delete()
                        except Exception as e:
                            print(f"ERROR deleting channel {e}")
            if after.channel.name == "Create Private Channel":
                guild = member.guild
                overwrites = {
                    guild.default_role: discord.PermissionOverwrite(view_channel=False, connect=False),
                    member: discord.PermissionOverwrite(view_channel=True, connect=True),
                    guild.me: discord.PermissionOverwrite(view_channel=True, connect=True)
                }
                channel = await guild.create_voice_channel(
                    name=f"{member.name}'s Private Channel",
                    overwrites=overwrites,
                    category=after.channel.category
                )
                await member.move_to(channel)
                embed = discord.Embed(title=f'', color=discord.Color.blue())
                embed.set_author(name=member.name, icon_url=member.display_avatar.url)
                embed.add_field(name='User Join Channel', value=f"{after.channel.name}" or 'Channel Not Found')
                embed.set_footer(text=f'{longstamp}')
                await log_channel.send(embed=embed)
                #await member.voice.channel.connect()
            else:
                return
#LOGGING STUFF#
#Creation Logs
@client.event
async def on_audit_log_entry_create(entry):
    log_channel = get(entry.guild.channels, name='logs' )
    if entry.user == client.user:
        return
    if log_channel:
        if entry.action == discord.AuditLogAction.channel_create:
            embed = discord.Embed(title=f'', color=discord.Color.green())
            embed.set_author(name=entry.user.name, icon_url=entry.user.display_avatar.url)
            embed.add_field(name='Channel Created', value=entry.target)
            embed.add_field(name='Reason', value=entry.reason or 'No Reason Given')
            embed.set_footer(text=f'Action ID: {entry.id} * {stamp}')
            await log_channel.send(embed=embed)
            return
        if entry.action == discord.AuditLogAction.role_create:
            embed = discord.Embed(title=f'Role Created: {entry.target}', color=discord.Color.green())
            embed.set_author(name=entry.user.name, icon_url=entry.user.display_avatar.url)
            embed.add_field(name='Role Created', value=entry.target)
            embed.add_field(name='Reason', value=entry.reason or 'No Reason Given')
            embed.set_footer(text=f'Action ID: {entry.id} * {stamp}')
            await log_channel.send(embed=embed)
            return
        if entry.action == discord.AuditLogAction.role_update or entry.action == discord.AuditLogAction.member_role_update:
            if entry.changes.before.roles > entry.changes.after.roles:
                removed_roles = [role for role in entry.changes.before.roles if role not in entry.changes.after.roles]
                role_mentions = [role.mention for role in removed_roles]
                embed = discord.Embed(title=f'', color=discord.Color.orange())
                embed.set_author(name=entry.user.name, icon_url=entry.user.display_avatar.url)
                embed.add_field(name='Role Removed', value="".join(role_mentions))
                embed.add_field(name='Reason', value=entry.reason or 'No Reason Given')
                embed.set_footer(text=f'Action ID: {entry.id} * {stamp}')
                await log_channel.send(embed=embed)
                return
            if entry.changes.after.roles > entry.changes.before.roles:
                added_roles = [role for role in entry.changes.after.roles if role not in entry.changes.before.roles]
                role_mentions = [role.mention for role in added_roles]
                embed = discord.Embed(title=f'', color=discord.Color.orange())
                embed.set_author(name=entry.user.name, icon_url=entry.user.display_avatar.url)
                embed.add_field(name='Role Added', value="".join(role_mentions))
                embed.add_field(name='Reason', value=entry.reason or 'No Reason Given')
                embed.set_footer(text=f'Action ID: {entry.id} * {stamp}')
                await log_channel.send(embed=embed)
                return
        if entry.action == discord.AuditLogAction.member_role_update:
            await log_channel.send(f'Action: Roles Updated\nBy: {entry.user}\nTarget: {entry.target}\nChanges: {entry.changes} ')
            return
        else:
            return
    else:
        await entry.guild.create_text_channel(f'logs')
        time.sleep(0.5)
        client.dispatch("on_audit_log_entry_create", entry)
        pass
#Deletion Logs
@client.event
async def on_guild_channel_delete(channel):
    log_channel = get(channel.guild.channels, name='logs')
    if log_channel:
        Log_cache = {
            "name": channel.name,
            "overwrites": channel.overwrites,
            "position": channel.position,
            "category": channel.category
            }
        async for entry in channel.guild.audit_logs(limit=1, action=discord.AuditLogAction.channel_delete):
            if entry.user == client.user:
                return
            else:
                embed = discord.Embed(title=f'', color=discord.Color.red())
                embed.set_author(name=entry.user.name, icon_url=entry.user.display_avatar.url)
                embed.add_field(name='Channel Deleted', value=f"{channel.name}" or 'Channel Not Found')
                embed.set_footer(text=f'Action ID: {entry.id} * {stamp}')
                await log_channel.send(embed=embed, view=chView(Log_cache))
    else:
        await channel.guild.create_text_channel(f'logs')
        time.sleep(0.5)
        print('log channel made')
        client.dispatch("guild_channel_delete", channel)
        pass
@client.event
async def on_guild_role_delete(role):
    log_channel = get(role.guild.channels, name='logs')
    if log_channel:
        Log_cache = {
            "name": role.name,
            "overwrites": role.permissions,
            "position": role.position,
            }
        async for entry in role.guild.audit_logs(limit=1, action=discord.AuditLogAction.role_delete):
            if entry.user == client.user:
                return
            else:
                embed = discord.Embed(title=f'', color=discord.Color.red())
                embed.set_author(name=entry.user.name, icon_url=entry.user.display_avatar.url)
                embed.add_field(name='Role Deleted', value=f"{role.name}" or 'Role Not Found')
                embed.set_footer(text=f'Action ID: {entry.id} * {stamp}')
                await log_channel.send(embed=embed, view=RView(Log_cache))
    else:
        await role.guild.create_text_channel(f'logs')
        time.sleep(0.5)
        print('log channel made')
        client.dispatch("guild_role_delete", role)
        pass
@client.event
async def on_message_delete(message):
    if message.author == client.user:
        return
    else:
        log_channel = get(message.guild.channels, name='logs')
        if log_channel:
            if message.content:
                Log_cache = {
                "name": message.author,
                "overwrites": message.content,
                "position": message.channel,
                "time": message.created_at,
                "message": message
                }
                async for entry in message.guild.audit_logs(limit=1, action=discord.AuditLogAction.message_delete):
                    embed = discord.Embed(title=f'', color=discord.Color.red())
                    embed.set_author(name=entry.user.name, icon_url=entry.user.display_avatar.url)
                    embed.add_field(name='Message Deleted', value=f"**In channel**: {message.channel.mention}\n{message.content}" or 'Unable to recover message!!')
                    embed.set_footer(text=f'Action ID: {entry.id} * {stamp}')
                    await log_channel.send(embed=embed, view=MView(Log_cache))
                    return
            if message.attachments:
                    for attachment in message.attachments:
                        Log_cache = {
                        "name": message.author,
                        "overwrites": attachment,
                        "position": message.channel,
                        "time": message.created_at,
                        "message": message
                        }
                        if attachment.proxy_url:
                            embed = discord.Embed(title=f'Message Deleted', color=discord.Color.red())
                            embed.set_image(url=attachment.proxy_url)
                            embed.add_field(name="Attachment URL, may expire", value=attachment.proxy_url, inline=False)
                            await log_channel.send(embed=embed, view=MView(Log_cache))
        else:
            await message.guild.create_text_channel(f'logs')
            time.sleep(0.5)
            print('log channel made')
            client.dispatch("message_delete", message)
            pass
#COMMANDS
@client.command()
async def uinvite(ctx):
    role = discord.utils.get(ctx.guild.roles, name="Member")
    member = ctx.author
    if role in member.roles:
        invite = await ctx.channel.create_invite(
            max_age=3600,
            max_uses=1,
            temporary=True,
            unique=True
        )
        await ctx.reply(f"Done here is your temparary invite. {invite}\nIts only one use and is active for an hour.", ephemeral=True)
    else:
        ctx.reply(f"You require the member role to create an invite....talk to an admin about getting the role!", ephemeral=True)
@client.command()
async def send(ctx, channel: discord.TextChannel, *, message):
    if ctx.author == BOT_OWNER_ID:
        await ctx.send("this command is bot owner only")
    else:
        embed = discord.Embed(title=f'Message By Admin', color=discord.Color.red())
        embed.add_field(name='', value=message)
        embed.set_footer(text=f'{stamp}')
        await channel.send(embed=embed)
@client.command()
async def vinvite(ctx, member:discord.Member):
        if ctx.author.voice:
            channel = ctx.author.voice.channel
            if "'s Private Channel" in channel.name:
                await channel.set_permissions(member, connect=True, speak=True, view_channel=True)
                await ctx.reply(f"Done! {member.name} can now see your private channel!!", ephemeral=True)
                await asyncio.sleep(0.5)
                await ctx.message.delete()
            else:
                await ctx.reply("You are not in a private call!", ephemeral=True)
                await asyncio.sleep(0.5)
                await ctx.message.delete()
        else:
            await ctx.reply('you must send this in a voice call', ephemeral=True)
            await asyncio.sleep(0.5)
            await ctx.message.delete()

@client.command()
async def summon(ctx):
    if ctx.author.voice:
        await ctx.author.voice.channel.connect()
    else:
        await ctx.send("your not in a call you fuckin idgiot")
@client.command()
async def remind(ctx, timer, unit, *, message="Times up"):
    timer = int(timer)
    time_sent = timer
    if unit == "s":
        pass
    elif unit == "m":
        timer *= 60
    elif unit == "h":
        timer *= 3600
    elif unit == None:
        return
    else:
        embed = discord.Embed(title=f'**ERROR**', color=discord.Color.red())
        embed.add_field(name='Invalid Unit' ,value=f'{unit} is not a valid time unit, acceptable units are-"s" for Seconds "m" for Minutes and "h" for Hours')
        await ctx.send(embed=embed)
        return
    if timer > 86400:
        embed = discord.Embed(title=f'**ERROR**', color=discord.Color.red())
        embed.add_field(name='Wait Time Too Long' ,value=f'Reminder time can only go up to 24Hours (until i create a way to make it longer :P)')
        await ctx.reply(embed=embed)
        return
    await ctx.reply(f'reminder created for {time_sent}{unit}')
    await asyncio.sleep(timer)
    embed = discord.Embed(title=f'Remember',description=f"**{ctx.author.mention}**\n**{message}**", color=discord.Color.blue())
    await ctx.send(embed=embed)
@client.command()
async def set_prefix(ctx, new_prefix: str):
    guild_id = str(ctx.guild.id)
    options = load_settings()
    if guild_id in options:
        options[guild_id]["prefix"] = new_prefix
        save_prefixes(options)
        await ctx.send(f'Prefix changed to " {new_prefix} " for server " {ctx.guild.name} "')
    else:
        await ctx.send(f'Failed to find Server settings please re-invite bot')
@client.command()
async def manservopt(ctx):
    options = load_settings()
    if str(ctx.guild.id) not in options:
        options[str(ctx.guild.id)] = {
            "prefix": ".",
            "welcome_channel": None,
            "mod_role_id": None,
            "logs_enabled": None
        }
        save_prefixes(options)
        print("done")
@client.command(help='disables and enables commands- owner only command')
@commands.is_owner()
async def toggle(ctx , command_name: str):
    command = client.get_command(command_name)
    if command is None:
        await ctx.send(f'unable to find command {command_name}')
        return
    if command == ctx.command:
        await ctx.send('unable to disable toggle command')
        return
    command.enabled = not command.enabled
    status = "enabled" if command.enabled else "disabled"
    await ctx.send(f'the command {command_name} has been {status}')
@toggle.error
async def toggle_error(ctx, error):
    if isinstance(error, commands.NotOwner):
        await ctx.send(f'this command is owner only FACK OFF')
@client.command()
async def get_audit_log_entry(ctx, entry_id: int):
    if not ctx.guild:
        await ctx.send("This command can only be used in a server.")
        return
    async for entry in ctx.guild.audit_logs(limit=100):
        if entry.id == entry_id:
            await ctx.send(f"Found entry for ID: **{entry_id}**\nAction: {entry.action.name}\nUser (Executor): {entry.user}\nTarget: {entry.target}\nReason: {entry.reason}")
        return
client.run(BOT_TOKEN_ID)
