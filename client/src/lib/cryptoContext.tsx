/**
 * CryptoContext — site-wide E2E encryption + presence
 *
 * Wraps the entire app. On login it:
 *  1. Generates an RSA-OAEP key pair in the browser (private key never leaves)
 *  2. Uploads the public key to /api/messenger/public-key
 *  3. Opens an SSE stream for real-time messages + presence updates
 *  4. Sends presence heartbeats every 15 s; detects away after 2 min idle
 *
 * Any component can call useCrypto() to access:
 *  - keyPair        — the local CryptoKeyPair
 *  - publicKeys     — userId → CryptoKey (remote public keys, cached)
 *  - fetchPublicKey — load + cache a remote user's public key
 *  - presenceMap    — { [userId]: "online" | "away" | "offline" }
 *  - encryptFor     — convenience wrapper around encryptMessage
 *  - decrypt        — convenience wrapper around decryptMessage
 */

import {
  createContext, useContext, useEffect, useRef, useState, ReactNode,
} from "react";
import { generateKeyPair, exportPublicKeyJwk, importPublicKeyJwk, encryptMessage, decryptMessage, type EncryptedPayload } from "./crypto";
import { apiRequest, queryClient } from "./queryClient";
import { useAuth } from "./auth";

interface CryptoContextValue {
  keyPair: CryptoKeyPair | null;
  publicKeys: Record<number, CryptoKey>;
  fetchPublicKey: (userId: number) => Promise<CryptoKey | null>;
  presenceMap: Record<string, string>;
  encryptFor: (text: string, recipientIds: number[]) => Promise<string>; // returns JSON string
  decrypt: (payloadJson: string) => Promise<string>;
  isReady: boolean;
}

const CryptoContext = createContext<CryptoContextValue>({
  keyPair: null,
  publicKeys: {},
  fetchPublicKey: async () => null,
  presenceMap: {},
  encryptFor: async () => "",
  decrypt: async () => "",
  isReady: false,
});

export function CryptoProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [keyPair, setKeyPair] = useState<CryptoKeyPair | null>(null);
  const [publicKeys, setPublicKeys] = useState<Record<number, CryptoKey>>({});
  const [presenceMap, setPresenceMap] = useState<Record<string, string>>({});
  const [isReady, setIsReady] = useState(false);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sseRef = useRef<EventSource | null>(null);
  const kpRef = useRef<CryptoKeyPair | null>(null);

  // Generate key pair once on mount
  useEffect(() => {
    generateKeyPair().then((kp) => {
      setKeyPair(kp);
      kpRef.current = kp;
    });
  }, []);

  // When user logs in and key pair is ready — wire everything up
  useEffect(() => {
    if (!user || !keyPair) return;

    let cancelled = false;

    (async () => {
      // Upload public key
      const jwk = await exportPublicKeyJwk(keyPair.publicKey);
      await apiRequest("POST", "/api/messenger/public-key", { publicKey: jwk });
      if (cancelled) return;
      setIsReady(true);

      // Open SSE stream
      const es = new EventSource("/api/messenger/sse", { withCredentials: true });
      es.onmessage = (e) => {
        const event = JSON.parse(e.data);
        if (event.type === "presence") {
          setPresenceMap(event.data);
        }
        if (event.type === "message") {
          // Invalidate the relevant message query so MessagesPage refetches
          queryClient.invalidateQueries({ queryKey: ["/api/messenger/messages", event.data.conversationId] });
        }
      };
      sseRef.current = es;

      // Presence heartbeat every 15 s
      heartbeatRef.current = setInterval(() => {
        apiRequest("POST", "/api/messenger/presence", { status: "online" }).catch(() => {});
      }, 15_000);
      apiRequest("POST", "/api/messenger/presence", { status: "online" }).catch(() => {});

      // Away detection: 2 min of no activity → "away"
      let awayTimer: ReturnType<typeof setTimeout>;
      const resetAway = () => {
        clearTimeout(awayTimer);
        apiRequest("POST", "/api/messenger/presence", { status: "online" }).catch(() => {});
        awayTimer = setTimeout(() => {
          apiRequest("POST", "/api/messenger/presence", { status: "away" }).catch(() => {});
        }, 120_000);
      };
      window.addEventListener("mousemove", resetAway);
      window.addEventListener("keydown", resetAway);
      resetAway();

      // Cleanup stored on the effect teardown below
      return () => {
        es.close();
        clearTimeout(awayTimer);
        window.removeEventListener("mousemove", resetAway);
        window.removeEventListener("keydown", resetAway);
        if (heartbeatRef.current) clearInterval(heartbeatRef.current);
        apiRequest("POST", "/api/messenger/presence", { status: "offline" }).catch(() => {});
      };
    })().then((cleanup) => {
      if (cancelled && cleanup) cleanup();
    });

    return () => {
      cancelled = true;
      sseRef.current?.close();
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [user?.id, keyPair]);

  // Reset when user logs out
  useEffect(() => {
    if (!user) {
      sseRef.current?.close();
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      setPresenceMap({});
      setIsReady(false);
    }
  }, [user]);

  const fetchPublicKey = async (userId: number): Promise<CryptoKey | null> => {
    if (publicKeys[userId]) return publicKeys[userId];
    try {
      const res = await apiRequest("GET", `/api/messenger/public-key/${userId}`);
      const data = await res.json();
      const key = await importPublicKeyJwk(data.publicKey);
      setPublicKeys((prev) => ({ ...prev, [userId]: key }));
      return key;
    } catch {
      return null;
    }
  };

  const encryptFor = async (text: string, recipientIds: number[]): Promise<string> => {
    if (!keyPair) throw new Error("Key pair not ready");
    const keys: Record<string, CryptoKey> = {};
    // Always include self so sender can decrypt their own sent messages
    const ids = Array.from(new Set([...recipientIds, user!.id]));
    for (const id of ids) {
      let key: CryptoKey | null = null;
      if (id === user!.id) {
        key = keyPair.publicKey;
      } else {
        key = await fetchPublicKey(id);
      }
      if (key) keys[String(id)] = key;
    }
    const payload = await encryptMessage(text, keys);
    return JSON.stringify(payload);
  };

  const decrypt = async (payloadJson: string): Promise<string> => {
    if (!keyPair || !user) throw new Error("Key pair not ready");
    const payload: EncryptedPayload = JSON.parse(payloadJson);
    return decryptMessage(payload, String(user.id), keyPair.privateKey);
  };

  return (
    <CryptoContext.Provider value={{ keyPair, publicKeys, fetchPublicKey, presenceMap, encryptFor, decrypt, isReady }}>
      {children}
    </CryptoContext.Provider>
  );
}

export const useCrypto = () => useContext(CryptoContext);
