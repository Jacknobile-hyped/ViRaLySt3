// server.js - Backend unificato per upload multi-piattaforma
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

// Importa i moduli per ciascuna piattaforma
const youtubeService = require('./services/youtube');


const app = express();
const port = process.env.PORT || 3000;

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

// Modificare la funzione per ottenere gli account dell'utente
app.get('/api/user/accounts', authenticateToken, async (req, res) => {
  try {
    // Ottieni l'ID utente dal token
    const userId = req.user.userId;
    
    // Array di piattaforme e nomi delle tabelle corrispondenti
    const platforms = [
      { name: 'youtube', table: 'Acc personali Youtube' },
      { name: 'tiktok', table: 'Acc Personali TikTok' },
      { name: 'facebook', table: 'Acc personali Facebook' },
      { name: 'instagram', table: 'Acc personali Instagram' },
      { name: 'twitter', table: 'Acc personali Twitter' },
      { name: 'reddit', table: 'Acc personali Reddit' },
      { name: 'snapchat', table: 'Acc personali Snapchat' }
    ];
    
    // Raccogli gli account da tutte le piattaforme
    const accounts = {};
    
    for (const platform of platforms) {
      // Query per ottenere gli account di questa piattaforma per questo utente
      const { data, error } = await supabase
        .from(platform.table)
        .select('id, name')
        .eq('user_id', userId);
      
      if (error) throw error;
      
      // Formatta i dati per la risposta
      accounts[platform.name] = data.map(acc => ({
        accountId: acc.id.toString(),
        accountName: acc.name
      }));
    }
    
    res.json({ accounts });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint per ottenere tutti gli account collegati dell'utente
app.get('/api/user/accounts', authenticateToken, async (req, res) => {
  try {
    
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
    
    // Determina il nome della tabella corretta in base alla piattaforma
    let tableName = '';
    switch (platform) {
      case 'youtube':
        tableName = 'Acc personali Youtube';
        break;
      case 'tiktok':
        tableName = 'Acc Personali TikTok';
        break;
      case 'facebook':
        tableName = 'Acc personali Facebook';
        break;
      case 'instagram':
        tableName = 'Acc personali Instagram';
        break;
      case 'twitter':
        tableName = 'Acc personali Twitter';
        break;
      case 'reddit':
        tableName = 'Acc personali Reddit';
        break;
      case 'snapchat':
        tableName = 'Acc personali Snapchat';
        break;
    }
    
    // Verifica se l'account esiste già
    const { data: existingAccount, error: queryError } = await supabase
      .from(tableName)
      .select('*')
      .eq('account_id', accountInfo.accountId)
      .eq('user_id', userId);
    
    if (queryError) throw queryError;
    
    if (existingAccount && existingAccount.length > 0) {
      // Aggiorna l'account esistente
      const { error: updateError } = await supabase
        .from(tableName)
        .update({
          name: accountInfo.accountName,
          access_token: accountInfo.accessToken,
          refresh_token: accountInfo.refreshToken || existingAccount[0].refresh_token,
          expiry_date: accountInfo.expiryDate
        })
        .eq('account_id', accountInfo.accountId)
        .eq('user_id', userId);
        
      if (updateError) throw updateError;
    } else {
      // Inserisci nuovo account
      const { error: insertError } = await supabase
        .from(tableName)
        .insert({
          user_id: userId,
          account_id: accountInfo.accountId,
          name: accountInfo.accountName,
          access_token: accountInfo.accessToken,
          refresh_token: accountInfo.refreshToken,
          expiry_date: accountInfo.expiryDate
        });
        
      if (insertError) throw insertError;
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
      
      // Determina il nome della tabella Supabase
      let tableName;
      switch (platform) {
        case 'youtube':
          tableName = 'Acc personali Youtube';
          service = youtubeService;
          break;
        case 'tiktok':
          tableName = 'Acc Personali TikTok';
          // service = tiktokService; // Commentato perché non è ancora implementato
          results.platforms[platform].error = 'Piattaforma non ancora implementata';
          continue;
        case 'facebook':
          tableName = 'Acc personali Facebook';
          // service = facebookService;
          results.platforms[platform].error = 'Piattaforma non ancora implementata';
          continue;
        case 'instagram':
          tableName = 'Acc personali Instagram';
          // service = instagramService;
          results.platforms[platform].error = 'Piattaforma non ancora implementata';
          continue;
        case 'twitter':
          tableName = 'Acc personali Twitter';
          // service = twitterService;
          results.platforms[platform].error = 'Piattaforma non ancora implementata';
          continue;
        case 'reddit':
          tableName = 'Acc personali Reddit';
          // service = redditService;
          results.platforms[platform].error = 'Piattaforma non ancora implementata';
          continue;
        case 'snapchat':
          tableName = 'Acc personali Snapchat';
          // service = snapchatService;
          results.platforms[platform].error = 'Piattaforma non ancora implementata';
          continue;
        default:
          results.platforms[platform].error = 'Piattaforma non supportata';
          continue;
      }

      // Recupera gli account selezionati da Supabase
      const { data: platformAccounts, error } = await supabase
        .from(tableName)
        .select('*')
        .eq('user_id', req.user.userId)
        .in('id', accounts[platform]);
      
      if (error) {
        results.platforms[platform].error = error.message;
        results.overall.success = false;
        continue;
      }
      
      if (!platformAccounts || platformAccounts.length === 0) {
        results.platforms[platform].error = 'Nessun account trovato';
        results.overall.success = false;
        continue;
      }
      
      // Processa ogni account per questa piattaforma
      for (const accountInfo of platformAccounts) {
        try {
          // Verifica se è necessario aggiornare il token
          const expiryDate = new Date(accountInfo.expiry_date);
          if (expiryDate && Date.now() > expiryDate) {
            try {
              const newTokens = await service.refreshToken(accountInfo.refresh_token);
              
              // Aggiorna i token nell'account
              const { error: updateError } = await supabase
                .from(tableName)
                .update({
                  access_token: newTokens.accessToken,
                  expiry_date: newTokens.expiryDate
                })
                .eq('id', accountInfo.id);
              
              if (updateError) throw updateError;
              
              // Aggiorna il token in memoria per questo upload
              accountInfo.access_token = newTokens.accessToken;
            } catch (refreshError) {
              throw new Error(`Errore durante l'aggiornamento del token: ${refreshError.message}`);
            }
          }
          
          // Carica il video
          const uploadResult = await service.uploadVideo({
            videoPath,
            title,
            description,
            tags: tags ? tags.split(',') : [],
            accessToken: accountInfo.access_token
          });
          
          results.platforms[platform].accountResults.push({
            accountId: accountInfo.id,
            accountName: accountInfo.name,
            success: true,
            videoId: uploadResult.videoId,
            videoUrl: uploadResult.videoUrl
          });
        } catch (error) {
          results.platforms[platform].accountResults.push({
            accountId: accountInfo.id,
            accountName: accountInfo.name,
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