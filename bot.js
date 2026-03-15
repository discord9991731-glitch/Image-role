const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, PermissionFlagsBits } = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = '1482720881116709044';

const configs = new Map();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

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
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON(),
];

async function registerCommands(guildId) {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, guildId), { body: commands });
  console.log(`[✓] Slash commands registered for guild ${guildId}`);
}

// ── Ready — register commands for every guild the bot is in ──────────────────
client.once('ready', async () => {
  console.log(`[✓] Logged in as ${client.user.tag}`);
  for (const guild of client.guilds.cache.values()) {
    try {
      await registerCommands(guild.id);
    } catch (err) {
      console.error(`[!] Failed to register for ${guild.id}:`, err.message);
    }
  }
});

// ── New guild join ────────────────────────────────────────────────────────────
client.on('guildCreate', async (guild) => {
  try {
    await registerCommands(guild.id);
  } catch (err) {
    console.error(`[!] Failed to register for ${guild.id}:`, err.message);
  }
});

// ── Slash command handler ─────────────────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== 'setup') return;

  if (interaction.user.id !== interaction.guild.ownerId) {
    return interaction.reply({ content: '❌ Only the server owner can use this command.', ephemeral: true });
  }

  const channelId = interaction.options.getString('channel');
  const amount    = interaction.options.getInteger('amount');
  const roleId    = interaction.options.getString('role');

  const channel = interaction.guild.channels.cache.get(channelId);
  if (!channel) {
    return interaction.reply({ content: `❌ Channel \`${channelId}\` not found.`, ephemeral: true });
  }

  const role = interaction.guild.roles.cache.get(roleId);
  if (!role) {
    return interaction.reply({ content: `❌ Role \`${roleId}\` not found.`, ephemeral: true });
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

    if (member.roles.cache.has(config.roleId)) return;

    try {
      await member.roles.add(role);
      await message.reply(`🎉 <@${member.id}> sent ${imageCount} images and earned the **${role.name}** role!`);
    } catch (err) {
      console.error('[!] Failed to assign role:', err.message);
      await message.reply(`⚠️ Permissions error — make sure my role is above **${role.name}** in the role list.`);
    }
  }
});

// ── Login ─────────────────────────────────────────────────────────────────────
client.login(TOKEN);
