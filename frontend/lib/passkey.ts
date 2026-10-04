"use client";

const toBase64Url = (value: ArrayBuffer): string => {
  const bytes = new Uint8Array(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const fromBase64Url = (value: string): ArrayBuffer => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
};

const prepareCreationOptions = (raw: Record<string, any>): PublicKeyCredentialCreationOptions => ({
  ...raw,
  challenge: fromBase64Url(raw.challenge),
  user: { ...raw.user, id: fromBase64Url(raw.user.id) },
  excludeCredentials: (raw.excludeCredentials || []).map((item: Record<string, any>) => ({
    ...item,
    id: fromBase64Url(item.id),
  })),
}) as PublicKeyCredentialCreationOptions;

const prepareRequestOptions = (raw: Record<string, any>): PublicKeyCredentialRequestOptions => ({
  ...raw,
  challenge: fromBase64Url(raw.challenge),
  allowCredentials: (raw.allowCredentials || []).map((item: Record<string, any>) => ({
    ...item,
    id: fromBase64Url(item.id),
  })),
}) as PublicKeyCredentialRequestOptions;

const serializeCredential = (credential: PublicKeyCredential) => {
  const response = credential.response;
  const base = {
    id: credential.id,
    rawId: toBase64Url(credential.rawId),
    type: credential.type,
  };
  if (response instanceof AuthenticatorAttestationResponse) {
    return {
      ...base,
      response: {
        clientDataJSON: toBase64Url(response.clientDataJSON),
        attestationObject: toBase64Url(response.attestationObject),
        transports: response.getTransports?.() || [],
      },
    };
  }
  const assertion = response as AuthenticatorAssertionResponse;
  return {
    ...base,
    response: {
      clientDataJSON: toBase64Url(assertion.clientDataJSON),
      authenticatorData: toBase64Url(assertion.authenticatorData),
      signature: toBase64Url(assertion.signature),
      userHandle: assertion.userHandle ? toBase64Url(assertion.userHandle) : null,
    },
  };
};

export const passkeysSupported = () =>
  typeof window !== "undefined" && Boolean(window.PublicKeyCredential && navigator.credentials);

export async function createPasskey(options: Record<string, any>) {
  if (!passkeysSupported()) throw new Error("This browser or device does not support Face ID/passkeys.");
  const credential = await navigator.credentials.create({ publicKey: prepareCreationOptions(options) });
  if (!(credential instanceof PublicKeyCredential)) throw new Error("Passkey registration was cancelled.");
  return serializeCredential(credential);
}

export async function getPasskey(options: Record<string, any>) {
  if (!passkeysSupported()) throw new Error("This browser or device does not support Face ID/passkeys.");
  const credential = await navigator.credentials.get({ publicKey: prepareRequestOptions(options) });
  if (!(credential instanceof PublicKeyCredential)) throw new Error("Face ID/passkey verification was cancelled.");
  return serializeCredential(credential);
}
