// services/youtube.js
const { google } = require('googleapis');
const fs = require('fs');

// Configurazioni OAuth
const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID;
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;
const REDIRECT_URI = process.env.BASE_URL + 'https://viralyst.online/oauth-callback/';

// Crea un client OAuth2
const createOAuthClient = () => {
  return new google.auth.OAuth2(
    CLIENT_ID,
    CLIENT_SECRET,
    REDIRECT_URI
  );
};

/**
 * Genera URL di autorizzazione per YouTube
 */
exports.getAuthUrl = (userId) => {
  const oauth2Client = createOAuthClient();
  const scopes = [
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtube'
  ];
  
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // Forza l'utente a dare consenso anche se l'ha già fatto
    scope: scopes,
    state: userId
  });
};

/**
 * Gestisce il callback di autorizzazione OAuth
 */
exports.handleCallback = async (code) => {
  const oauth2Client = createOAuthClient();
  const { tokens } = await oauth2Client.getToken(code);
  
  // Ottieni informazioni sull'account
  oauth2Client.setCredentials(tokens);
  const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
  
  const channelInfo = await youtube.channels.list({
    part: 'snippet',
    mine: true
  });
  
  const channel = channelInfo.data.items[0];
  
  return {
    accountId: channel.id,
    accountName: channel.snippet.title,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiryDate: tokens.expiry_date
  };
};

/**
 * Aggiorna il token di accesso
 */
exports.refreshToken = async (refreshToken) => {
  const oauth2Client = createOAuthClient();
  oauth2Client.setCredentials({
    refresh_token: refreshToken
  });
  
  const { tokens } = await oauth2Client.refreshAccessToken();
  
  return {
    accessToken: tokens.access_token,
    expiryDate: tokens.expiry_date
  };
};

/**
 * Carica un video su YouTube
 */
exports.uploadVideo = async ({ videoPath, title, description, tags, accessToken }) => {
  const oauth2Client = createOAuthClient();
  oauth2Client.setCredentials({
    access_token: accessToken
  });
  
  const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
  
  const response = await youtube.videos.insert({
    part: 'snippet,status',
    requestBody: {
      snippet: {
        title: title || 'Video senza titolo',
        description: description || '',
        tags: tags || []
      },
      status: {
        privacyStatus: 'unlisted' // O 'public', 'private'
      }
    },
    media: {
      body: fs.createReadStream(videoPath)
    }
  });
  
  return {
    videoId: response.data.id,
    videoUrl: `https://www.youtube.com/watch?v=${response.data.id}`
  };
};