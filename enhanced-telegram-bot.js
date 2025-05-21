const express = require('express');
const { Telegraf } = require('telegraf');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Configuration
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL; // Your Render URL: https://your-app-name.onrender.com
const DATA_DIR = path.join(__dirname, 'data');
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// File paths
const ADMINS_FILE = path.join(DATA_DIR, 'admins.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const AI_SETTINGS_FILE = path.join(DATA_DIR, 'ai_settings.json');

// Initialize data files if they don't exist
if (!fs.existsSync(ADMINS_FILE)) {
  // Initialize with one admin (replace ADMIN_ID with your Telegram ID)
  const primaryAdminId = process.env.ADMIN_ID || '123456789';
  fs.writeFileSync(ADMINS_FILE, JSON.stringify([primaryAdminId]), 'utf8');
  console.log(`Bot initialized with primary admin ID: ${primaryAdminId}`);
}

if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, JSON.stringify({}), 'utf8');
}

if (!fs.existsSync(AI_SETTINGS_FILE)) {
  fs.writeFileSync(AI_SETTINGS_FILE, JSON.stringify({
    enabled: true,
    characterPrompt: "You are InstantTalkBot, a friendly and helpful AI assistant for Telegram. You have a vibrant personality and love to chat with users. You provide helpful and thoughtful responses while maintaining a positive and engaging tone. Your goal is to create meaningful conversations and provide valuable feedback to users. Be concise but informative, and always try to add a touch of personality to your responses."
  }), 'utf8');
}

// Chat histories storage
const chatHistories = {};

// Helper functions
function getAdmins() {
  try {
    return JSON.parse(fs.readFileSync(ADMINS_FILE, 'utf8'));
  } catch (error) {
    console.error('Error reading admins file:', error);
    return [];
  }
}

function saveAdmins(admins) {
  fs.writeFileSync(ADMINS_FILE, JSON.stringify(admins), 'utf8');
}

function getUsers() {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch (error) {
    console.error('Error reading users file:', error);
    return {};
  }
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users), 'utf8');
}

function getAISettings() {
  try {
    return JSON.parse(fs.readFileSync(AI_SETTINGS_FILE, 'utf8'));
  } catch (error) {
    console.error('Error reading AI settings file:', error);
    return {
      enabled: true,
      characterPrompt: "You are InstantTalkBot, a friendly and helpful AI assistant for Telegram. You have a vibrant personality and love to chat with users. You provide helpful and thoughtful responses while maintaining a positive and engaging tone. Your goal is to create meaningful conversations and provide valuable feedback to users. Be concise but informative, and always try to add a touch of personality to your responses."
    };
  }
}

function saveAISettings(settings) {
  fs.writeFileSync(AI_SETTINGS_FILE, JSON.stringify(settings), 'utf8');
}

function isAIEnabled(userId) {
  const users = getUsers();
  
  // Check if user has a specific setting
  if (users[userId] && users[userId].aiEnabled !== undefined) {
    return users[userId].aiEnabled;
  }
  
  // Fall back to global setting
  const aiSettings = getAISettings();
  return aiSettings.enabled;
}

function setUserAIEnabled(userId, enabled) {
  const users = getUsers();
  
  if (!users[userId]) {
    users[userId] = {
      id: userId,
      joined: new Date().toISOString()
    };
  }
  
  users[userId].aiEnabled = enabled;
  saveUsers(users);
}

function isAdmin(userId) {
  const admins = getAdmins();
  return admins.includes(userId.toString());
}

// Create bot
const bot = new Telegraf(BOT_TOKEN);

// Middleware to check for admin commands
bot.use(async (ctx, next) => {
  const userId = ctx.from?.id.toString();
  
  // Skip middleware for commands that don't require auth
  if (!ctx.message || !ctx.message.text) {
    return next();
  }
  
  // If it's an admin command, check if user is admin
  if (ctx.message.text.startsWith('/addadmin') || 
      ctx.message.text.startsWith('/removeadmin') ||
      ctx.message.text.startsWith('/aimode') ||
      ctx.message.text.startsWith('/setcharacter') ||
      ctx.message.text.startsWith('/listadmins')) {
    if (isAdmin(userId)) {
      return next();
    } else {
      return ctx.reply('You are not authorized to use this command.');
    }
  }
  
  return next();
});

// Handle start command
bot.start((ctx) => {
  const userId = ctx.from.id.toString();
  const admins = getAdmins();
  const primaryAdminId = process.env.ADMIN_ID || admins[0];
  
  if (isAdmin(userId)) {
    // Different welcome message for primary admin vs regular admin
    if (userId === primaryAdminId) {
      return ctx.reply(`Welcome, Primary Admin (Bot Owner)! Available commands:
/addadmin [user_id] - Add a new admin
/removeadmin [user_id] - Remove an admin
/listadmins - List all admin IDs
/aimode [on/off] - Turn AI mode on or off globally
/setcharacter [character description] - Set the AI character/personality

Reply to any forwarded message to respond to the user

As the primary admin, only you can add or remove other admins.`);
    } else {
      return ctx.reply(`Welcome, Admin! Available commands:
/listadmins - List all admin IDs
/aimode [on/off] - Turn AI mode on or off globally
/setcharacter [character description] - Set the AI character/personality

Reply to any forwarded message to respond to the user

Note: Only the primary admin can add or remove other admins.`);
    }
  } else {
    // Store user in the users file
    const users = getUsers();
    if (!users[userId]) {
      users[userId] = {
        id: userId,
        username: ctx.from.username || 'unknown',
        first_name: ctx.from.first_name || 'unknown',
        joined: new Date().toISOString(),
        aiEnabled: true
      };
      saveUsers(users);
    }
    
    return ctx.reply('Welcome to InstantTalkBot! Send any message to chat with me or use /help to see available commands.');
  }
});

// Handle help command
bot.command('help', (ctx) => {
  const userId = ctx.from.id.toString();
  
  if (isAdmin(userId)) {
    return ctx.reply(`Available commands for admins:
/addadmin [user_id] - Add a new admin (primary admin only)
/removeadmin [user_id] - Remove an admin (primary admin only)
/listadmins - List all admin IDs
/aimode [on/off] - Turn AI mode on or off globally
/setcharacter [character description] - Set the AI character/personality
/ai [on/off] - Turn AI on or off for yourself

Reply to any forwarded message to respond to the user`);
  } else {
    return ctx.reply(`Available commands:
/help - Show this help message
/ai [on/off] - Turn AI responses on or off for yourself
/clear - Clear your conversation history with the AI

Send any message to chat with the AI assistant!`);
  }
});

// Handle list admins command
bot.command('listadmins', (ctx) => {
  const userId = ctx.from.id.toString();
  const admins = getAdmins();
  const primaryAdminId = process.env.ADMIN_ID || admins[0];
  
  if (!isAdmin(userId)) {
    return ctx.reply('You are not authorized to use this command.');
  }
  
  let adminList = '👑 Admin List:\n\n';
  
  admins.forEach((adminId, index) => {
    if (adminId === primaryAdminId) {
      adminList += `${index + 1}. ${adminId} (Primary Admin/Bot Owner) 👑\n`;
    } else {
      adminList += `${index + 1}. ${adminId}\n`;
    }
  });
  
  adminList += '\nOnly the primary admin can add or remove other admins.';
  
  return ctx.reply(adminList);
});

// Handle add admin command
bot.command('addadmin', (ctx) => {
  const args = ctx.message.text.split(' ');
  
  if (args.length !== 2) {
    return ctx.reply('Usage: /addadmin [user_id]');
  }
  
  const userId = ctx.from.id.toString();
  const newAdminId = args[1].trim();
  const admins = getAdmins();
  
  // Only the primary admin can add other admins for extra security
  const primaryAdminId = process.env.ADMIN_ID || admins[0];
  if (userId !== primaryAdminId) {
    return ctx.reply('Only the primary admin (bot owner) can add new admins.');
  }
  
  if (admins.includes(newAdminId)) {
    return ctx.reply('This user is already an admin.');
  }
  
  admins.push(newAdminId);
  saveAdmins(admins);
  
  return ctx.reply(`User ${newAdminId} has been added as an admin.`);
});

// Handle remove admin command
bot.command('removeadmin', (ctx) => {
  const args = ctx.message.text.split(' ');
  
  if (args.length !== 2) {
    return ctx.reply('Usage: /removeadmin [user_id]');
  }
  
  const userId = ctx.from.id.toString();
  const adminIdToRemove = args[1].trim();
  const admins = getAdmins();
  
  // Prevent removing the primary admin (the first one in the list)
  const primaryAdminId = process.env.ADMIN_ID || admins[0];
  if (adminIdToRemove === primaryAdminId) {
    return ctx.reply('Cannot remove the primary admin (bot owner).');
  }
  
  // Only the primary admin can remove other admins
  if (userId !== primaryAdminId) {
    return ctx.reply('Only the primary admin (bot owner) can remove admins.');
  }
  
  // Prevent removing the last admin
  if (admins.length === 1 && admins[0] === adminIdToRemove) {
    return ctx.reply('Cannot remove the last admin.');
  }
  
  const updatedAdmins = admins.filter(id => id !== adminIdToRemove);
  
  if (updatedAdmins.length === admins.length) {
    return ctx.reply('Admin not found.');
  }
  
  saveAdmins(updatedAdmins);
  
  return ctx.reply(`User ${adminIdToRemove} has been removed from admins.`);
});

// Handle aimode command (global setting)
bot.command('aimode', (ctx) => {
  const userId = ctx.from.id.toString();
  const args = ctx.message.text.split(' ');
  
  if (!isAdmin(userId)) {
    return ctx.reply('You are not authorized to use this command.');
  }
  
  if (args.length !== 2 || !['on', 'off'].includes(args[1].toLowerCase())) {
    return ctx.reply('Usage: /aimode [on/off]');
  }
  
  const enabled = args[1].toLowerCase() === 'on';
  const aiSettings = getAISettings();
  aiSettings.enabled = enabled;
  saveAISettings(aiSettings);
  
  return ctx.reply(`AI mode has been turned ${enabled ? 'ON' : 'OFF'} globally.`);
});

// Handle ai command (user-specific setting)
bot.command('ai', (ctx) => {
  const userId = ctx.from.id.toString();
  const args = ctx.message.text.split(' ');
  
  if (args.length !== 2 || !['on', 'off'].includes(args[1].toLowerCase())) {
    return ctx.reply('Usage: /ai [on/off]');
  }
  
  const enabled = args[1].toLowerCase() === 'on';
  setUserAIEnabled(userId, enabled);
  
  return ctx.reply(`AI responses for you have been turned ${enabled ? 'ON' : 'OFF'}.`);
});

// Handle setcharacter command
bot.command('setcharacter', (ctx) => {
  const userId = ctx.from.id.toString();
  
  if (!isAdmin(userId)) {
    return ctx.reply('You are not authorized to use this command.');
  }
  
  const characterPrompt = ctx.message.text.replace(/^\/setcharacter\s+/, '');
  
  if (!characterPrompt.trim()) {
    return ctx.reply('Usage: /setcharacter [character description]');
  }
  
  const aiSettings = getAISettings();
  aiSettings.characterPrompt = characterPrompt;
  saveAISettings(aiSettings);
  
  return ctx.reply('AI character has been updated!');
});

// Handle clear command
bot.command('clear', (ctx) => {
  const userId = ctx.from.id.toString();
  
  if (chatHistories[userId]) {
    delete chatHistories[userId];
    return ctx.reply('Your conversation history with the AI has been cleared.');
  } else {
    return ctx.reply('You have no conversation history to clear.');
  }
});

// Handle admin replies with media
async function handleAdminReply(ctx) {
  const userId = ctx.from.id.toString();
  
  if (!isAdmin(userId) || !ctx.message.reply_to_message) {
    return;
  }
  
  const originalMessage = ctx.message.reply_to_message;
  
  // Check if the replied message contains a user ID in the footer
  if (originalMessage.text && originalMessage.text.includes('User ID:')) {
    const match = originalMessage.text.match(/User ID: (\d+)/);
    if (match && match[1]) {
      const targetUserId = match[1];
      
      try {
        // Determine media type and send accordingly
        if (ctx.message.photo) {
          await bot.telegram.sendPhoto(
            targetUserId,
            ctx.message.photo[ctx.message.photo.length - 1].file_id,
            { caption: ctx.message.caption }
          );
        } else if (ctx.message.video) {
          await bot.telegram.sendVideo(
            targetUserId,
            ctx.message.video.file_id,
            { caption: ctx.message.caption }
          );
        } else if (ctx.message.document) {
          await bot.telegram.sendDocument(
            targetUserId,
            ctx.message.document.file_id,
            { caption: ctx.message.caption }
          );
        } else if (ctx.message.audio) {
          await bot.telegram.sendAudio(
            targetUserId,
            ctx.message.audio.file_id,
            { caption: ctx.message.caption }
          );
        } else if (ctx.message.voice) {
          await bot.telegram.sendVoice(
            targetUserId,
            ctx.message.voice.file_id,
            { caption: ctx.message.caption }
          );
        } else if (ctx.message.sticker) {
          await bot.telegram.sendSticker(
            targetUserId,
            ctx.message.sticker.file_id
          );
        }
        
        return ctx.reply('Media sent to user.');
      } catch (error) {
        return ctx.reply(`Failed to send media: ${error.message}`);
      }
    }
  }
  
  return ctx.reply('Cannot determine the target user. Please reply to a forwarded user message.');
}

// Handle forwarding messages from users to admins
async function handleForwardToAdmins(ctx) {
  const userId = ctx.from.id.toString();
  const admins = getAdmins();
  
  if (isAdmin(userId)) {
    return; // Don't forward if sender is an admin
  }
  
  // Store user if not already stored
  const users = getUsers();
  if (!users[userId]) {
    users[userId] = {
      id: userId,
      username: ctx.from.username || 'unknown',
      first_name: ctx.from.first_name || 'unknown',
      joined: new Date().toISOString(),
      aiEnabled: true
    };
    saveUsers(users);
  }
  
  // Process with AI if enabled
  if (isAIEnabled(userId)) {
    // For text messages, continue to generateAIResponse
    if (ctx.message.text) {
      return generateAIResponse(ctx);
    }
  }
  
  // Forward to all admins based on message type
  for (const adminId of admins) {
    try {
      if (ctx.message.photo) {
        const photo = ctx.message.photo[ctx.message.photo.length - 1];
        const caption = ctx.message.caption || 'No caption';
        await bot.telegram.sendPhoto(
          adminId,
          photo.file_id,
          { 
            caption: `Photo from ${ctx.from.first_name || 'Unknown'} (@${ctx.from.username || 'no_username'}):\n\n${caption}\n\nUser ID: ${userId}`
          }
        );
      } else if (ctx.message.video) {
        const video = ctx.message.video;
        const caption = ctx.message.caption || 'No caption';
        await bot.telegram.sendVideo(
          adminId,
          video.file_id,
          { 
            caption: `Video from ${ctx.from.first_name || 'Unknown'} (@${ctx.from.username || 'no_username'}):\n\n${caption}\n\nUser ID: ${userId}`
          }
        );
      } else if (ctx.message.document) {
        const document = ctx.message.document;
        const caption = ctx.message.caption || 'No caption';
        await bot.telegram.sendDocument(
          adminId,
          document.file_id,
          { 
            caption: `Document from ${ctx.from.first_name || 'Unknown'} (@${ctx.from.username || 'no_username'}):\n\n${caption}\n\nUser ID: ${userId}`
          }
        );
      } else if (ctx.message.audio) {
        const audio = ctx.message.audio;
        const caption = ctx.message.caption || 'No caption';
        await bot.telegram.sendAudio(
          adminId,
          audio.file_id,
          { 
            caption: `Audio from ${ctx.from.first_name || 'Unknown'} (@${ctx.from.username || 'no_username'}):\n\n${caption}\n\nUser ID: ${userId}`
          }
        );
      } else if (ctx.message.voice) {
        const voice = ctx.message.voice;
        await bot.telegram.sendVoice(
          adminId,
          voice.file_id,
          { 
            caption: `Voice message from ${ctx.from.first_name || 'Unknown'} (@${ctx.from.username || 'no_username'})\n\nUser ID: ${userId}`
          }
        );
      } else if (ctx.message.sticker) {
        // First send the sticker
        await bot.telegram.sendSticker(
          adminId,
          ctx.message.sticker.file_id
        );
        // Then send a text message with user info since stickers don't support captions
        await bot.telegram.sendMessage(
          adminId,
          `Sticker from ${ctx.from.first_name || 'Unknown'} (@${ctx.from.username || 'no_username'})\n\nUser ID: ${userId}`
        );
      }
    } catch (error) {
      console.error(`Failed to forward media to admin ${adminId}:`, error);
    }
  }
  
  // Only reply if AI is disabled (for non-text messages)
  if (!isAIEnabled(userId)) {
    return ctx.reply('Your message has been forwarded to our team.');
  }
}

// Function to generate AI response using Gemini API
async function generateAIResponse(ctx) {
  const userId = ctx.from.id.toString();
  const userMessage = ctx.message.text;
  
  // Handle new chat initialization
  if (!chatHistories[userId]) {
    chatHistories[userId] = [];
  }
  
  // Add user message to history
  chatHistories[userId].push({
    role: "user",
    parts: userMessage
  });
  
  // Get AI character prompt
  const aiSettings = getAISettings();
  const characterPrompt = aiSettings.characterPrompt;
  
  try {
    // First, forward the message to admins
    forwardTextToAdmins(ctx);
    
    // Send "typing" action to simulate thinking
    await ctx.replyWithChatAction('typing');
    
    // Create a formatted history for the API
    let historyFormatted = [];
    
    // Add the character prompt as the first system message
    historyFormatted.push({
      role: "system",
      parts: [{ text: characterPrompt }]
    });
    
    // Add the conversation history
    chatHistories[userId].forEach(msg => {
      historyFormatted.push({
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: msg.parts }]
      });
    });
    
    // Make API call to Gemini
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: historyFormatted,
        generationConfig: {
          temperature: 0.7,
          topP: 0.95,
          topK: 40,
          maxOutputTokens: 2048
        },
        safetySettings: [
          {
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_ONLY_HIGH"
          },
          {
            category: "HARM_CATEGORY_HATE_SPEECH",
            threshold: "BLOCK_ONLY_HIGH"
          },
          {
            category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
            threshold: "BLOCK_ONLY_HIGH"
          },
          {
            category: "HARM_CATEGORY_DANGEROUS_CONTENT",
            threshold: "BLOCK_ONLY_HIGH"
          }
        ]
      }
    );
    
    let aiResponse = '';
    
    // Parse response
    if (response.data && 
        response.data.candidates && 
        response.data.candidates[0] && 
        response.data.candidates[0].content &&
        response.data.candidates[0].content.parts) {
      
      aiResponse = response.data.candidates[0].content.parts[0].text;
      
      // Add AI response to history
      chatHistories[userId].push({
        role: "model",
        parts: aiResponse
      });
      
      // Limit history size to avoid hitting API limits
      if (chatHistories[userId].length > 20) {
        chatHistories[userId] = chatHistories[userId].slice(-20);
      }
      
      // Send response to user, splitting if necessary
      if (aiResponse.length > 4096) {
        // Split response into chunks
        for (let i = 0; i < aiResponse.length; i += 4096) {
          const chunk = aiResponse.substring(i, i + 4096);
          await ctx.reply(chunk);
        }
      } else {
        await ctx.reply(aiResponse);
      }
    } else {
      // If no valid response from API
      await ctx.reply("I'm having trouble processing your request right now. Please try again later.");
    }
  } catch (error) {
    console.error("Error generating AI response:", error);
    await ctx.reply("Sorry, I encountered an error while generating a response. Please try again later.");
  }
}

// Helper function to forward text messages to admins
async function forwardTextToAdmins(ctx) {
  const userId = ctx.from.id.toString();
  const admins = getAdmins();
  
  // Forward message to all admins
  for (const adminId of admins) {
    try {
      await bot.telegram.sendMessage(
        adminId,
        `Message from ${ctx.from.first_name || 'Unknown'} (@${ctx.from.username || 'no_username'}):\n\n${ctx.message.text}\n\nUser ID: ${userId}`
      );
    } catch (error) {
      console.error(`Failed to forward message to admin ${adminId}:`, error);
    }
  }
}

// Handle text messages from users
bot.on('text', async (ctx) => {
  const userId = ctx.from.id.toString();
  const messageId = ctx.message.message_id;
  const admins = getAdmins();
  
  // Check if this is a reply from an admin
  if (isAdmin(userId) && ctx.message.reply_to_message) {
    const originalMessage = ctx.message.reply_to_message;
    
    // Check if the replied message contains a user ID in the footer
    if (originalMessage.text && originalMessage.text.includes('User ID:')) {
      const match = originalMessage.text.match(/User ID: (\d+)/);
      if (match && match[1]) {
        const targetUserId = match[1];
        const replyText = ctx.message.text;
        
        try {
          await bot.telegram.sendMessage(targetUserId, replyText);
          return ctx.reply('Message sent to user.');
        } catch (error) {
          return ctx.reply(`Failed to send message: ${error.message}`);
        }
      }
    }
    return ctx.reply('Cannot determine the target user. Please reply to a forwarded user message.');
  }
  
  // For regular users, check if AI is enabled
  if (!isAdmin(userId)) {
    // Store user if not already stored
    const users = getUsers();
    if (!users[userId]) {
      users[userId] = {
        id: userId,
        username: ctx.from.username || 'unknown',
        first_name: ctx.from.first_name || 'unknown',
        joined: new Date().toISOString(),
        aiEnabled: true
      };
      saveUsers(users);
    }
    
    if (isAIEnabled(userId)) {
      // Process with AI
      return generateAIResponse(ctx);
    } else {
      // Forward to admins
      forwardTextToAdmins(ctx);
      return ctx.reply('Your message has been forwarded to our team.');
    }
  }
});

// Handle photos
bot.on('photo', (ctx) => handleForwardToAdmins(ctx));

// Handle videos
bot.on('video', (ctx) => handleForwardToAdmins(ctx));

// Handle documents/files
bot.on('document', (ctx) => handleForwardToAdmins(ctx));

// Handle audio
bot.on('audio', (ctx) => handleForwardToAdmins(ctx));

// Handle voice messages
bot.on('voice', (ctx) => handleForwardToAdmins(ctx));

// Handle stickers
bot.on('sticker', (ctx) => handleForwardToAdmins(ctx));

// Enable context for admin replies
bot.on(['photo', 'video', 'document', 'audio', 'sticker'], async (ctx) => {
  const userId = ctx.from.id.toString();
  
  if (isAdmin(userId) && ctx.message.reply_to_message) {
    // Handle admin reply with media
    return handleAdminReply(ctx);
  }
});

// Set up the express app for webhook
const app = express();
app.use(express.json());

// Set webhook route
app.post(`/webhook/${BOT_TOKEN}`, (req, res) => {
  bot.handleUpdate(req.body);
  res.status(200).send('OK');
});

// Health check route
app.get('/', (req, res) => {
  res.status(200).send('Bot is running!');
});

// Start the express server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  
  // Set webhook
  if (WEBHOOK_URL) {
    bot.telegram.setWebhook(`${WEBHOOK_URL}/webhook/${BOT_TOKEN}`)
      .then(() => {
        console.log('Webhook set successfully!');
      })
      .catch(error => {
        console.error('Failed to set webhook:', error);
      });
  } else {
    console.warn('WEBHOOK_URL environment variable not set. Bot will not receive updates.');
  }
});

// Handle process termination
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
