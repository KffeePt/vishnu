import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

export const vishnuGateway = functions.https.onRequest(async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    const authHeader = req.headers.authorization;
    const idToken = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;

    if (!idToken) {
      res.status(401).send('Missing token');
      return;
    }

    const decoded = await admin.auth().verifyIdToken(idToken);
    const hasDevClaim = decoded.dev === true || decoded.role === 'dev' || decoded.role === 'admin' || decoded.role === 'owner';

    if (!hasDevClaim) {
      res.status(403).send('Developer access required');
      return;
    }

    const { action, project, payload } = req.body || {};

    if (!action) {
      res.status(400).json({ status: 'error', error: 'Missing action' });
      return;
    }

    switch (action) {
      case 'generate_schema': {
        res.json({ status: 'ok', action, project, result: { message: 'Schema generation not implemented yet.' } });
        return;
      }
      case 'deploy_function': {
        res.json({ status: 'ok', action, project, result: { message: 'Deploy handler not implemented yet.' } });
        return;
      }
      default: {
        res.status(400).json({ status: 'error', error: `Unknown action: ${action}` });
        return;
      }
    }
  } catch (error: any) {
    console.error('vishnuGateway error:', error);
    res.status(500).json({ status: 'error', error: error.message || 'Internal error' });
  }
});
