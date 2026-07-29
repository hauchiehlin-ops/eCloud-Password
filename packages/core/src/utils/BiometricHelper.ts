export class BiometricHelper {
  /**
   * 在瀏覽器中檢查是否支援 WebAuthn 生物辨識
   */
  static async isSupported(): Promise<boolean> {
    return !!(
      window.PublicKeyCredential &&
      window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable &&
      await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
    );
  }

  /**
   * 註冊生物辨識憑證 (Passkey)
   */
  static async register(username: string): Promise<string> {
    const challenge = new Uint8Array(32);
    window.crypto.getRandomValues(challenge);

    const userID = new Uint8Array(16);
    window.crypto.getRandomValues(userID);

    const publicKeyCredentialCreationOptions: any = {
      challenge,
      rp: { name: "Cloud Password", id: window.location.hostname || "localhost" },
      user: {
        id: userID,
        name: username,
        displayName: username,
      },
      pubKeyCredParams: [{ alg: -7, type: "public-key" }, { alg: -257, type: "public-key" }],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
      },
      timeout: 60000,
      attestation: "direct",
    };

    const credential = await navigator.credentials.create({
      publicKey: publicKeyCredentialCreationOptions,
    }) as any;

    return btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));
  }

  /**
   * 驗證生物辨識
   */
  static async authenticate(credentialIdB64: string): Promise<boolean> {
    const challenge = new Uint8Array(32);
    window.crypto.getRandomValues(challenge);

    const credentialId = new Uint8Array(
      atob(credentialIdB64).split("").map((c) => c.charCodeAt(0))
    );

    const publicKeyCredentialRequestOptions: any = {
      challenge,
      allowCredentials: [{
        id: credentialId,
        type: "public-key",
        transports: ["internal"],
      }],
      userVerification: "required",
      timeout: 60000,
    };

    try {
      const assertion = await navigator.credentials.get({
        publicKey: publicKeyCredentialRequestOptions,
      });
      return !!assertion;
    } catch (e) {
      console.error("Biometric Auth Failed", e);
      return false;
    }
  }
}
