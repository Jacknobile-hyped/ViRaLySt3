// server.js - Backend unificato per upload multi-piattaforma
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

// Importa i moduli per ciascuna piattaforma
const youtubeService = require('./services/youtube');
const tiktokService = require('./services/tiktok');
const facebookService = require('./services/facebook');
const instagramService = require('./services/instagram');
const twitterService = require('./services/twitter');
const redditService = require('./services/reddit');
const snapchatService = require('./services/snapchat');

const app = express();
const port = process.env.PORT || 3000;

// Database connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// Schema utente con array di account per ciascuna piattaforma
const UserSchema = new mongoose.Schema({
  userId: String,
  accounts: {
    youtube: [{
      accountId: String,
      accountName: String,
      accessToken: String,
      refreshToken: String,
      expiryDate: Date
    }],
    tiktok: [{
      accountId: String,
      accountName: String,
      accessToken: String,
      refreshToken: String,
      expiryDate: Date
    }],
    facebook: [{
      accountId: String,
      accountName: String,
      accessToken: String,
      refreshToken: String,
      expiryDate: Date
    }],
    instagram: [{
      accountId: String,
      accountName: String,
      accessToken: String,
      refreshToken: String,
      expiryDate: Date
    }],
    twitter: [{
      accountId: String,
      accountName: String,
      accessToken: String,
      refreshToken: String,
      expiryDate: Date
    }],
    reddit: [{
      accountId: String,
      accountName: String,
      accessToken: String,
      refreshToken: String,
      expiryDate: Date
    }],
    snapchat: [{
      accountId: String,
      accountName: String,
      accessToken: String,
      refreshToken: String,
      expiryDate: Date
    }]
  }
});

const User = mongoose.model('User', UserSchema);

// Middleware
app.use(cors());
app.use(express.json());

// Configurazione storage per upload video
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 500 * 1024 * 1024 } // Limite 500MB per supportare video più grandi
});

// Middleware autenticazione
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: 'Autenticazione richiesta' });
  
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token non valido' });
    req.user = user;
    next();
  });
};

// Endpoint per ottenere tutti gli account collegati dell'utente
app.get('/api/user/accounts', authenticateToken, async (req, res) => {
  try {
    const user = await User.findOne({ userId: req.user.userId });
    
    if (!user) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }
    
    // Prepara una risposta semplificata con solo i nomi degli account
    const platforms = ['youtube', 'tiktok', 'facebook', 'instagram', 'twitter', 'reddit', 'snapchat'];
    const accounts = {};
    
    platforms.forEach(platform => {
      accounts[platform] = user.accounts[platform].map(acc => ({
        accountId: acc.accountId,
        accountName: acc.accountName
      }));
    });
    
    res.json({ accounts });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint unificato per generare URL di autorizzazione
app.get('/api/auth/:platform/url', authenticateToken, (req, res) => {
  const { platform } = req.params;
  
  // Selezione del servizio in base alla piattaforma
  let service;
  switch (platform) {
    case 'youtube':
      service = youtubeService;
      break;
    case 'tiktok':
      service = tiktokService;
      break;
    case 'facebook':
      service = facebookService;
      break;
    case 'instagram':
      service = instagramService;
      break;
    case 'twitter':
      service = twitterService;
      break;
    case 'reddit':
      service = redditService;
      break;
    case 'snapchat':
      service = snapchatService;
      break;
    default:
      return res.status(400).json({ error: 'Piattaforma non supportata' });
  }
  
  try {
    const authUrl = service.getAuthUrl(req.user.userId);
    res.json({ authUrl });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Callback unificato per OAuth
app.get('/oauth/:platform/callback', async (req, res) => {
  const { platform } = req.params;
  const { code, state } = req.query;
  const userId = state; // L'ID utente è stato passato nello stato
  
  // Selezione del servizio
  let service;
  switch (platform) {
    case 'youtube':
      service = youtubeService;
      break;
    case 'tiktok':
      service = tiktokService;
      break;
    case 'facebook':
      service = facebookService;
      break;
    case 'instagram':
      service = instagramService;
      break;
    case 'twitter':
      service = twitterService;
      break;
    case 'reddit':
      service = redditService;
      break;
    case 'snapchat':
      service = snapchatService;
      break;
    default:
      return res.status(400).json({ error: 'Piattaforma non supportata' });
  }
  
  try {
    // Ottieni i token e le info dell'account
    const accountInfo = await service.handleCallback(code);
    
    // Salva i token nel database
    const user = await User.findOne({ userId });
    
    if (!user) {
      // Crea nuovo utente
      const newUser = new User({
        userId,
        accounts: {
          youtube: [],
          tiktok: [],
          facebook: [],
          instagram: [],
          twitter: [],
          reddit: [],
          snapchat: []
        }
      });
      
      newUser.accounts[platform].push(accountInfo);
      await newUser.save();
    } else {
      // Controlla se questo account esiste già
      const existingAccount = user.accounts[platform].findIndex(
        acc => acc.accountId === accountInfo.accountId
      );
      
      if (existingAccount >= 0) {
        // Aggiorna i token
        user.accounts[platform][existingAccount] = {
          ...accountInfo,
          refreshToken: accountInfo.refreshToken || user.accounts[platform][existingAccount].refreshToken
        };
      } else {
        // Aggiungi nuovo account
        user.accounts[platform].push(accountInfo);
      }
      
      await user.save();
    }
    
    // Reindirizza alla tua app
    res.redirect(`https://tua-app-bravo.com/auth-success?platform=${platform}`);
  } catch (error) {
    console.error(`Errore durante l'autorizzazione ${platform}:`, error);
    res.redirect(`https://tua-app-bravo.com/auth-error?platform=${platform}`);
  }
});

// Endpoint unificato per multi-upload
app.post('/api/upload', authenticateToken, upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nessun file caricato' });
    }
    
    const { title, description, tags, selectedAccounts } = req.body;
    let accounts;
    
    try {
      accounts = JSON.parse(selectedAccounts);
    } catch (e) {
      return res.status(400).json({ error: 'Formato degli account selezionati non valido' });
    }
    
    if (!accounts || typeof accounts !== 'object') {
      return res.status(400).json({ error: 'Nessun account specificato' });
    }
    
    // Recupera l'utente
    const user = await User.findOne({ userId: req.user.userId });
    
    if (!user) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }
    
    const results = {
      overall: { success: true },
      platforms: {}
    };
    
    const videoPath = req.file.path;
    
    // Processa ogni piattaforma selezionata
    const platforms = Object.keys(accounts);
    
    for (const platform of platforms) {
      // Salta piattaforme non selezionate o vuote
      if (!accounts[platform] || accounts[platform].length === 0) continue;
      
      results.platforms[platform] = { accountResults: [] };
      
      // Selezione del servizio
      let service;
      switch (platform) {
        case 'youtube':
          service = youtubeService;
          break;
        case 'tiktok':
          service = tiktokService;
          break;
        case 'facebook':
          service = facebookService;
          break;
        case 'instagram':
          service = instagramService;
          break;
        case 'twitter':
          service = twitterService;
          break;
        case 'reddit':
          service = redditService;
          break;
        case 'snapchat':
          service = snapchatService;
          break;
        default:
          results.platforms[platform].error = 'Piattaforma non supportata';
          continue;
      }
      
      // Processa ogni account per questa piattaforma
      for (const accountId of accounts[platform]) {
        try {
          // Trova l'account dell'utente
          const accountInfo = user.accounts[platform].find(acc => acc.accountId === accountId);
          
          if (!accountInfo) {
            results.platforms[platform].accountResults.push({
              accountId,
              success: false,
              error: 'Account non trovato'
            });
            continue;
          }
          
          // Aggiorna token se necessario
          if (accountInfo.expiryDate && Date.now() > accountInfo.expiryDate) {
            const newTokens = await service.refreshToken(accountInfo.refreshToken);
            accountInfo.accessToken = newTokens.accessToken;
            accountInfo.expiryDate = newTokens.expiryDate;
          }
          
          // Carica il video
          const uploadResult = await service.uploadVideo({
            videoPath,
            title,
            description,
            tags: tags ? tags.split(',') : [],
            accessToken: accountInfo.accessToken
          });
          
          results.platforms[platform].accountResults.push({
            accountId,
            accountName: accountInfo.accountName,
            success: true,
            videoId: uploadResult.videoId,
            videoUrl: uploadResult.videoUrl
          });
        } catch (error) {
          results.platforms[platform].accountResults.push({
            accountId,
            success: false,
            error: error.message
          });
          
          // Se una piattaforma fallisce completamente, segnala fallimento generale
          if (results.platforms[platform].accountResults.every(r => !r.success)) {
            results.overall.success = false;
          }
        }
      }
    }
    
    // Salva eventuali token aggiornati
    await user.save();
    
    // Pulisci il file temporaneo
    fs.unlinkSync(videoPath);
    
    return res.status(200).json(results);
  } catch (error) {
    console.error('Errore durante l\'upload multiplo:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Crea cartella per upload temporanei
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// Crea cartella per i moduli di servizio
if (!fs.existsSync('services')) {
  fs.mkdirSync('services');
}

// Avvia il server
app.listen(port, () => {
  console.log(`Server in esecuzione sulla porta ${port}`);
});