import { db } from "@/config/firebase-admin";
import { NextRequest, NextResponse } from "next/server";
import { adminAuthMiddleware } from "@/middleware/adminAuthMiddleware";
import { requireSessionAuth, getMasterPassword } from "@/lib/sessionAuth";
import { encryptData, decryptData } from "@/lib/encryption";

export async function GET(request: NextRequest) {
  try {
    // Use centralized encryption service for decryption
    const { searchParams } = new URL(request.url);
    const masterPasswordOverride = searchParams.get('masterPassword');

    // Build URL for centralized decryption service
    const serviceUrl = new URL(`${request.nextUrl.origin}/api/admin/encryption-service/decrypt-batch`);
    serviceUrl.searchParams.set('type', 'product');
    if (masterPasswordOverride) {
      serviceUrl.searchParams.set('password', masterPasswordOverride);
    }

    // Forward authentication headers
    const response = await fetch(serviceUrl, {
      method: 'POST', // Use POST for batch operations
      headers: {
        'Authorization': request.headers.get('authorization') || '',
        'x-master-password-session': request.headers.get('x-master-password-session') || '',
      },
    });

    if (!response.ok) {
      return response; // Return the error from the service
    }

    const data = await response.json();
    // Transform from service format to products format
    return NextResponse.json({ products: data.items });
  } catch (error) {
    console.error("Error fetching products:", error);
    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check authentication and admin/owner access
    const authResult = await adminAuthMiddleware(request);
    if (authResult) {
      return authResult;
    }

    // Check master password session
    const sessionResult = await requireSessionAuth(request);
    if (sessionResult) {
      return sessionResult;
    }

    const { name, price, flavor, description, imageUrl, stockQuantity, weightGrams } = await request.json();

    if (!name || !price) {
      return NextResponse.json({ error: "Missing required fields: name, price" }, { status: 400 });
    }

    // Auto-generate category by combining name and flavor
    const category = flavor ? `${name.toLowerCase().replace(/\s+/g, '-')}-${flavor.toLowerCase().replace(/\s+/g, '-')}` : name.toLowerCase().replace(/\s+/g, '-');

    // Get master password for encryption
    let masterPasswordStr;
    try {
      masterPasswordStr = await getMasterPassword(request as any);
    } catch (error) {
      return NextResponse.json({ error: "Master password not set or invalid" }, { status: 400 });
    }

    // Encrypt sensitive data before saving
    const sensitiveData = {
      name,
      price: parseFloat(price),
      category,
      flavor: flavor || null,
      description: description || "",
      imageUrl: imageUrl || "",
      stockQuantity: parseInt(stockQuantity) || 0,
      weightGrams: weightGrams ? parseFloat(weightGrams) : null,
    };

    const encryptedSensitiveData = encryptData(sensitiveData, masterPasswordStr);

    // Save to udhhmbtc collection with encrypted data (same collection as sales)
    const productsRef = db.collection("udhhmbtc");
    const productData = {
      type: "product",
      encryptedData: encryptedSensitiveData,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const docRef = await productsRef.add(productData);

    console.log(`Product created with ID: ${docRef.id}, type: "product"`);

    return NextResponse.json({
      message: "Product created successfully",
      id: docRef.id,
    });
  } catch (error) {
    console.error("Error creating product:", error);
    return NextResponse.json({ error: "Failed to create product" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    // Check authentication and admin/owner access
    const authResult = await adminAuthMiddleware(request);
    if (authResult) {
      return authResult;
    }

    // Check master password session
    const sessionResult = await requireSessionAuth(request);
    if (sessionResult) {
      return sessionResult;
    }

    const { id, name, price, flavor, description, imageUrl, stockQuantity, weightGrams } = await request.json();

    if (!id || !name || !price) {
      return NextResponse.json({ error: "Missing required fields: id, name, price" }, { status: 400 });
    }

    // Auto-generate category by combining name and flavor
    const category = flavor ? `${name.toLowerCase().replace(/\s+/g, '-')}-${flavor.toLowerCase().replace(/\s+/g, '-')}` : name.toLowerCase().replace(/\s+/g, '-');

    // Get master password for encryption
    let masterPasswordStr;
    try {
      masterPasswordStr = await getMasterPassword(request as any);
    } catch (error) {
      return NextResponse.json({ error: "Master password not set or invalid" }, { status: 400 });
    }

    // Encrypt sensitive data before saving
    const sensitiveData = {
      name,
      price: parseFloat(price),
      category,
      flavor: flavor || null,
      description: description || "",
      imageUrl: imageUrl || "",
      stockQuantity: parseInt(stockQuantity) || 0,
      weightGrams: weightGrams ? parseFloat(weightGrams) : null,
    };

    const encryptedSensitiveData = encryptData(sensitiveData, masterPasswordStr);

    // Update in udhhmbtc collection with encrypted data
    const productRef = db.collection("udhhmbtc").doc(id);
    await productRef.update({
      encryptedData: encryptedSensitiveData,
      updatedAt: new Date(),
    });

    return NextResponse.json({
      message: "Product updated successfully",
      id: id,
    });
  } catch (error) {
    console.error("Error updating product:", error);
    return NextResponse.json({ error: "Failed to update product" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Check authentication and admin/owner access
    const authResult = await adminAuthMiddleware(request);
    if (authResult) {
      return authResult;
    }

    // Check master password session
    const sessionResult = await requireSessionAuth(request);
    if (sessionResult) {
      return sessionResult;
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: "Product ID is required" }, { status: 400 });
    }

    // Delete from udhhmbtc collection
    const productRef = db.collection("udhhmbtc").doc(id);
    await productRef.delete();

    return NextResponse.json({
      message: "Product deleted successfully",
      id: id,
    });
  } catch (error) {
    console.error("Error deleting product:", error);
    return NextResponse.json({ error: "Failed to delete product" }, { status: 500 });
  }
}
