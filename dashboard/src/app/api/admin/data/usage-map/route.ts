import { NextRequest, NextResponse } from "next/server";
import admin, { db } from "@/config/firebase-admin";
import { adminAuthMiddleware } from "@/middleware/adminAuthMiddleware";

type UsageNode = {
  name: string;
  path: string;
  bytes: number;
  directBytes: number;
  directDocCount: number;
  totalDocCount: number;
  collectionCount: number;
  children: UsageNode[];
};

function normalizeValue(value: any): any {
  if (value === null || value === undefined) return value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (typeof value.toBase64 === "function") return `[bytes:${value.toBase64().length}]`;
  if (typeof value.path === "string" && typeof value.id === "string" && typeof value.parent === "object") return value.path;
  if (typeof value.latitude === "number" && typeof value.longitude === "number") {
    return { latitude: value.latitude, longitude: value.longitude };
  }
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, nestedValue]) => [key, normalizeValue(nestedValue)]));
  }

  return String(value);
}

function estimateDocumentBytes(id: string, data: Record<string, any>) {
  return Buffer.byteLength(
    JSON.stringify({
      id,
      data: normalizeValue(data),
    }),
    "utf8"
  );
}

async function buildCollectionNode(collectionRef: FirebaseFirestore.CollectionReference): Promise<UsageNode> {
  const snapshot = await collectionRef.get();
  const children: UsageNode[] = [];
  let directBytes = 0;

  for (const docSnap of snapshot.docs) {
    directBytes += estimateDocumentBytes(docSnap.id, docSnap.data());

    const subcollections = await docSnap.ref.listCollections();
    for (const subcollection of subcollections) {
      children.push(await buildCollectionNode(subcollection));
    }
  }

  children.sort((a, b) => b.bytes - a.bytes);

  const childBytes = children.reduce((sum, child) => sum + child.bytes, 0);
  const childDocCount = children.reduce((sum, child) => sum + child.totalDocCount, 0);
  const childCollectionCount = children.reduce((sum, child) => sum + child.collectionCount, 0);

  return {
    name: collectionRef.id,
    path: collectionRef.path,
    bytes: directBytes + childBytes,
    directBytes,
    directDocCount: snapshot.size,
    totalDocCount: snapshot.size + childDocCount,
    collectionCount: 1 + childCollectionCount,
    children,
  };
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await adminAuthMiddleware(request);
    if (authResult) return authResult;

    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decodedToken = await admin.auth().verifyIdToken(authHeader.substring(7));
    if (!decodedToken.owner && !decodedToken.admin) {
      return NextResponse.json({ error: "Admin or Owner access required" }, { status: 403 });
    }

    const rootCollections = await db.listCollections();
    const rootChildren = [];

    for (const collectionRef of rootCollections) {
      rootChildren.push(await buildCollectionNode(collectionRef));
    }

    rootChildren.sort((a, b) => b.bytes - a.bytes);

    const totalBytes = rootChildren.reduce((sum, node) => sum + node.bytes, 0);
    const totalDocuments = rootChildren.reduce((sum, node) => sum + node.totalDocCount, 0);
    const totalCollections = rootChildren.reduce((sum, node) => sum + node.collectionCount, 0);

    const usageTree: UsageNode = {
      name: "Firestore",
      path: "__root__",
      bytes: totalBytes,
      directBytes: 0,
      directDocCount: 0,
      totalDocCount: totalDocuments,
      collectionCount: totalCollections,
      children: rootChildren,
    };

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      summary: {
        totalBytes,
        totalDocuments,
        totalCollections,
        topLevelCollections: rootCollections.length,
      },
      tree: usageTree,
    });
  } catch (error) {
    console.error("Error building Firestore usage map:", error);
    return NextResponse.json({ error: "Failed to build Firestore usage map" }, { status: 500 });
  }
}
