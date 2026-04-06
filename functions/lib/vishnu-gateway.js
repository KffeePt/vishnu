"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.vishnuGateway = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
if (!admin.apps.length) {
    admin.initializeApp();
}
exports.vishnuGateway = functions.https.onRequest(async (req, res) => {
    try {
        if (req.method !== 'POST') {
            res.status(405).send('Method Not Allowed');
            return;
        }
        const authHeader = req.headers.authorization;
        const idToken = (authHeader === null || authHeader === void 0 ? void 0 : authHeader.startsWith('Bearer ')) ? authHeader.slice('Bearer '.length) : null;
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
        const { action, project } = req.body || {};
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
    }
    catch (error) {
        console.error('vishnuGateway error:', error);
        res.status(500).json({ status: 'error', error: error.message || 'Internal error' });
    }
});
//# sourceMappingURL=vishnu-gateway.js.map