import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { FIREBASE_CONFIG, CLOUDINARY_CONFIG } from './config';

// 1. Initialize Firebase
const app = initializeApp(FIREBASE_CONFIG);
export const auth = getAuth(app);
export const db = getDatabase(app);

// Helper function to generate SHA-1 signature for Cloudinary
async function generateSignature(timestamp: number, apiSecret: string): Promise<string> {
    // The signature is a SHA-1 hash of the sorted parameters (timestamp) + api_secret
    const str = `timestamp=${timestamp}${apiSecret}`;
    const enc = new TextEncoder();
    const hash = await crypto.subtle.digest('SHA-1', enc.encode(str));
    return Array.from(new Uint8Array(hash))
        .map(v => v.toString(16).padStart(2, '0'))
        .join('');
}

// 2. Cloudinary Upload Service (Signed Upload)
export const uploadToCloudinary = async (file: File): Promise<string> => {
    try {
        const timestamp = Math.round((new Date()).getTime() / 1000);
        const signature = await generateSignature(timestamp, CLOUDINARY_CONFIG.apiSecret);

        const formData = new FormData();
        formData.append('file', file);
        formData.append('api_key', CLOUDINARY_CONFIG.apiKey);
        formData.append('timestamp', timestamp.toString());
        formData.append('signature', signature);

        // Using 'auto' resource type to handle both images and PDFs automatically
        const response = await fetch(
            `https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/auto/upload`,
            {
                method: 'POST',
                body: formData,
            }
        );

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Cloudinary error:', errorData);
            throw new Error(errorData.error?.message || 'Upload failed');
        }

        const data = await response.json();
        return data.secure_url;
    } catch (error) {
        console.error("Cloudinary Upload Error:", error);
        throw error;
    }
};