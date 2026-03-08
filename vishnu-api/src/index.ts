import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Firebase Admin (Assumes GOOGLE_APPLICATION_CREDENTIALS or default env is set)
if (admin.apps.length === 0) {
    admin.initializeApp({
        projectId: process.env.FIREBASE_PROJECT_ID || 'vishnu-platform'
    });
}

const db = admin.firestore();
const app = express();

app.use(cors());
app.use(express.json());

// Extend Express Request
declare global {
    namespace Express {
        interface Request {
            user?: admin.auth.DecodedIdToken;
        }
    }
}

// Authentication Middleware
const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }

    const token = authHeader.split('Bearer ')[1];
    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        req.user = decodedToken;
        next();
    } catch (error) {
        console.error('Token verification failed:', error);
        res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
};

// Role Authorization Middleware
const requireRole = (allowedRoles: string[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        
        // Owner overrides everything
        if (req.user.owner === true || req.user.role === 'owner') {
            return next();
        }

        if (!req.user.role || !allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Forbidden: Insufficient role' });
        }
        
        next();
    };
};

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Create a new job
app.post('/api/v1/projects/:projectId/jobs', requireAuth, requireRole(['owner', 'projectManager', 'senior', 'dev']), async (req: Request, res: Response) => {
    const { projectId } = req.params;
    const { type, payload } = req.body;

    if (!type) {
        return res.status(400).json({ error: 'Missing job type' });
    }

    try {
        const jobRef = await db.collection('projects').doc(projectId).collection('jobs').add({
            type,
            status: 'pending',
            payload: payload || {},
            createdBy: req.user!.uid,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            logs: [],
        });

        res.status(201).json({ jobId: jobRef.id, status: 'pending' });
    } catch (error) {
        console.error('Error creating job:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Get job status
app.get('/api/v1/projects/:projectId/jobs/:jobId', requireAuth, async (req: Request, res: Response) => {
    const { projectId, jobId } = req.params;

    try {
        const doc = await db.collection('projects').doc(projectId).collection('jobs').doc(jobId).get();
        
        if (!doc.exists) {
            return res.status(404).json({ error: 'Job not found' });
        }

        res.json({ id: doc.id, ...doc.data() });
    } catch (error) {
        console.error('Error fetching job:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Cancel a job
app.post('/api/v1/projects/:projectId/jobs/:jobId/cancel', requireAuth, requireRole(['owner', 'projectManager', 'senior']), async (req: Request, res: Response) => {
    const { projectId, jobId } = req.params;

    try {
        const docRef = db.collection('projects').doc(projectId).collection('jobs').doc(jobId);
        const doc = await docRef.get();
        
        if (!doc.exists) {
            return res.status(404).json({ error: 'Job not found' });
        }

        if (doc.data()?.status === 'completed' || doc.data()?.status === 'failed') {
            return res.status(400).json({ error: 'Job already finished' });
        }

        await docRef.update({
            status: 'cancelled',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        res.json({ success: true, message: 'Job cancelled' });
    } catch (error) {
        console.error('Error cancelling job:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(\`Vishnu API stub running on port \${PORT}\`);
});
