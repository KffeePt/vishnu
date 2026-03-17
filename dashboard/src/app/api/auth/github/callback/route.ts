import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get("code");
    const state = searchParams.get("state"); // Usually the user's UID to link the account

    if (!code) {
        return NextResponse.json({ error: "No code provided" }, { status: 400 });
    }

    try {
        const HOST = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:5001/vishnu-b65bd/us-central1";
        
        // This relies on a Firebase Function to securely exchange the code for a token
        // using the GitHub App's Client Secret which is stored securely in Secret Manager.
        const response = await fetch(`${HOST}/exchangeGitHubCode`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ data: { code, uid: state } })
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Failed to exchange code: ${err}`);
        }

        // Redirect back to the dashboard home page after success
        return NextResponse.redirect(new URL("/", request.url));
    } catch (error: unknown) {
        console.error("OAuth Callback Error:", error);
        const message = error instanceof Error ? error.message : "OAuth callback failed";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
