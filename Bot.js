const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, PermissionFlagsBits } = require('discord.js');

// ── Config ──────────────────────────────────────────────────────────────────
const TOKEN = 'MTQ4MjcyMDg4MTExNjcwOTA0NA.GCaNcM.fMQzZcwLdiHKZ0LnAKrbL0TM8f1kVdzYqk6XUs';
const CLIENT_ID = '1482720881116709044';

// In-memory store: guildId → { channelId, requiredImages, roleId }
const configs = new Map();

// ── Client ───────────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// ── Register slash commands ───────────────────────────────────────────────────
const commands = [
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure the image-to-role watcher')
    .addStringOption(opt =>
      opt.setName('channel').setDescription('Channel ID to watch').setRequired(true)
    )
    .addIntegerOption(opt =>
      opt.setName('amount').setDescription('Number of images required in one message').setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('role').setDescription('Role ID to assign').setRequired(true)
    )
    // Only server owner can use this command
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON(),
];

async function registerCommands(guildId) {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, guildId), { body: commands });
  console.log(`[✓] Slash commands registered for guild ${guildId}`);
}

// ── Ready ─────────────────────────────────────────────────────────────────────
client.once('ready', () => {
  console.log(`[✓] Logged in as ${client.user.tag}`);
});

// ── Guild join → auto-register commands ──────────────────────────────────────
client.on('guildCreate', async (guild) => {
  await registerCommands(guild.id);
});

// ── Slash command handler ─────────────────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== 'setup') return;

  // Only the server OWNER can use this
  if (interaction.user.id !== interaction.guild.ownerId) {
    return interaction.reply({ content: '❌ Only the server owner can use this command.', ephemeral: true });
  }

  const channelId   = interaction.options.getString('channel');
  const amount      = interaction.options.getInteger('amount');
  const roleId      = interaction.options.getString('role');

  // Validate channel exists in this guild
  const channel = interaction.guild.channels.cache.get(channelId);
  if (!channel) {
    return interaction.reply({ content: `❌ Channel \`${channelId}\` not found in this server.`, ephemeral: true });
  }

  // Validate role exists in this guild
  const role = interaction.guild.roles.cache.get(roleId);
  if (!role) {
    return interaction.reply({ content: `❌ Role \`${roleId}\` not found in this server.`, ephemeral: true });
  }

  configs.set(interaction.guild.id, { channelId, requiredImages: amount, roleId });

  await interaction.reply({
    content: `✅ Setup complete!\n📌 **Watching:** <#${channelId}>\n🖼️ **Images required:** ${amount} in a single message\n🎭 **Role to assign:** <@&${roleId}>`,
    ephemeral: true,
  });
});

// ── Message handler ───────────────────────────────────────────────────────────
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const config = configs.get(message.guild?.id);
  if (!config) return;
  if (message.channel.id !== config.channelId) return;

  // Count attachments that are images
  const imageCount = message.attachments.filter(att => {
    const url = att.url.toLowerCase().split('?')[0];
    return url.endsWith('.png') || url.endsWith('.jpg') || url.endsWith('.jpeg') ||
           url.endsWith('.gif') || url.endsWith('.webp');
  }).size;

  if (imageCount >= config.requiredImages) {
    const member = message.member;
    if (!member) return;

    const role = message.guild.roles.cache.get(config.roleId);
    if (!role) return;

    // Already has the role? Skip
    if (member.roles.cache.has(config.roleId)) return;

    try {
      await member.roles.add(role);
      await message.reply(`🎉 <@${member.id}> sent ${imageCount} images and earned the **${role.name}** role!`);
    } catch (err) {
      console.error('[!] Failed to assign role:', err.message);
      await message.reply(`⚠️ I tried to assign the role but hit a permissions error. Make sure my role is above **${role.name}** in the role list.`);
    }
  }
});

// ── Login ─────────────────────────────────────────────────────────────────────
client.login(TOKEN).then(async () => {
  // Register commands for all guilds the bot is already in
  for (const guild of client.guilds.cache.values()) {
    await registerCommands(guild.id);
  }
});
