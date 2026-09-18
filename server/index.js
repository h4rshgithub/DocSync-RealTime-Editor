require('dotenv').config();
const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});
const admin = require('firebase-admin');
const debounce = require('lodash/debounce');
const helmet = require('helmet');
const fs = require('fs');
const cors = require('cors');
const nodemailer = require('nodemailer');

// Firebase Admin SDK initialize
try {
  let credential;
  if (process.env.FIREBASE_ADMIN_SDK_JSON) {
    // Production: full JSON string stored in env var
    credential = admin.credential.cert(JSON.parse(process.env.FIREBASE_ADMIN_SDK_JSON));
  } else if (process.env.FIREBASE_ADMIN_SDK_PATH) {
    // Development: path to the service account JSON file
    const serviceAccount = JSON.parse(fs.readFileSync(process.env.FIREBASE_ADMIN_SDK_PATH, 'utf8'));
    credential = admin.credential.cert(serviceAccount);
  } else {
    throw new Error('Neither FIREBASE_ADMIN_SDK_JSON nor FIREBASE_ADMIN_SDK_PATH is set');
  }
  admin.initializeApp({ credential });
  console.log('Firebase Admin SDK initialized successfully');
} catch (error) {
  console.error('Error initializing Firebase Admin SDK:', error);
  process.exit(1);
}

const db = admin.firestore();

// Nodemailer transporter (configured via EMAIL_USER / EMAIL_PASS in .env)
let transporter = null;
if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
  console.log('Email transport configured for:', process.env.EMAIL_USER);
} else {
  console.log('EMAIL_USER/EMAIL_PASS not set — email notifications disabled');
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000' }));
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Server is running' });
});

// Share document API endpoint
app.post('/api/share', async (req, res) => {
  const { docId, email, docName, sharedByName, docLink } = req.body;
  if (!docId || !email) {
    return res.status(400).json({ success: false, error: 'docId and email are required' });
  }

  try {
    const docRef = db.collection('docs').doc(docId);
    await docRef.update({
      sharedWith: admin.firestore.FieldValue.arrayUnion(email),
    });

    if (transporter) {
      const mailOptions = {
        from: `"DocSync" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: `${sharedByName || 'Someone'} shared a document with you on DocSync`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #f9fafb; border-radius: 12px; border: 1px solid #e5e7eb;">
            <div style="background: #4f46e5; width: 44px; height: 44px; border-radius: 10px; display: flex; align-items: center; justify-content: center; margin-bottom: 20px;">
              <span style="color: white; font-size: 22px; line-height: 44px; text-align: center; display: block; width: 100%;">📄</span>
            </div>
            <h2 style="color: #1f2937; margin: 0 0 12px; font-size: 20px;">Document Shared With You</h2>
            <p style="color: #4b5563; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
              <strong style="color: #111827;">${sharedByName || 'Someone'}</strong> has shared the document 
              <strong style="color: #4f46e5;">"${docName || 'Untitled Document'}"</strong> with you on DocSync.
            </p>
            <a href="${docLink}" style="display: inline-block; background: #4f46e5; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px;">Open Document</a>
            <p style="color: #9ca3af; font-size: 12px; margin-top: 24px; word-break: break-all;">
              Direct link: <a href="${docLink}" style="color: #4f46e5;">${docLink}</a>
            </p>
          </div>
        `,
      };
      await transporter.sendMail(mailOptions);
      console.log(`Email notification sent to ${email} for doc ${docId}`);
    }

    res.json({ success: true, emailSent: !!transporter });
  } catch (error) {
    console.error('Error in /api/share:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`A user connected: ${socket.id} at ${new Date().toISOString()}`);

  const broadcastChanges = debounce(({ docId, delta }) => {
    try {
      if (!docId || !delta) {
        throw new Error('Invalid docId or delta');
      }
      socket.to(docId).emit('receive-changes', delta);
    } catch (error) {
      console.error(`Error broadcasting changes for doc ${docId}:`, error.message);
    }
  }, 300, { leading: false, trailing: true });

  socket.on('join-doc', (docId) => {
    try {
      if (!docId) {
        throw new Error('docId is required');
      }
      socket.join(docId);
      socket.emit('joined', `Successfully joined doc: ${docId}`);
    } catch (error) {
      console.error(`Error in join-doc for socket ${socket.id}:`, error.message);
      socket.emit('error', { message: 'Failed to join document' });
    }
  });

  socket.on('send-changes', ({ docId, delta }) => {
    try {
      if (!docId || !delta) {
        throw new Error('docId and delta are required');
      }
      broadcastChanges({ docId, delta });
    } catch (error) {
      console.error(`Error in send-changes for socket ${socket.id}:`, error.message);
      socket.emit('error', { message: 'Failed to send changes' });
    }
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id} at ${new Date().toISOString()}`);
  });

  socket.on('error', (error) => {
    console.error(`Socket error for ${socket.id}:`, error.message);
  });
});

// Server start
const PORT = process.env.PORT || 5000;
http.listen(PORT, () => {
  console.log(`Socket.IO server running on port ${PORT} at ${new Date().toISOString()}`);
});