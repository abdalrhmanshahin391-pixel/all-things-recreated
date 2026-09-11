import { resolvePaddlePrice } from "@/utils/payments.functions";

const liveClientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as string | undefined;
const testClientToken = import.meta.env.VITE_PAYMENTS_TEST_CLIENT_TOKEN as string | undefined;
const forceTest = String(import.meta.env.VITE_PAYMENTS_FORCE_TEST ?? "") === "1";

declare global {
  interface Window {
    Paddle: any;
  }
}

export function getPaddleEnvironment(): "sandbox" | "live" {
  if (forceTest) return "sandbox";
  if (testClientToken && !liveClientToken?.startsWith("live_")) return "sandbox";
  return liveClientToken?.startsWith("live_") ? "live" : "sandbox";
}

function tokenFor(env: "sandbox" | "live"): string | undefined {
  if (env === "sandbox") {
    return testClientToken || (liveClientToken?.startsWith("test_") ? liveClientToken : undefined);
  }
  return liveClientToken?.startsWith("live_") ? liveClientToken : testClientToken;
}

let paddleInitialized = false;
let currentEnv: "sandbox" | "live" | null = null;
let initPromise: Promise<void> | null = null;
let activeEventCallback: ((data: any) => void) | null = null;

export async function initializePaddle(
  targetEnv?: "sandbox" | "live",
  onEvent?: (data: any) => void,
): Promise<void> {
  const env = targetEnv || getPaddleEnvironment();
  if (onEvent) {
    activeEventCallback = onEvent;
  }
  if (paddleInitialized && window.Paddle && currentEnv === env) return;
  if (initPromise && currentEnv === env) return initPromise;

  const token = tokenFor(env);
  if (!token) throw new Error("Payments are not configured");

  initPromise = new Promise<void>((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("Paddle can only be initialized in the browser"));
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://cdn.paddle.com/paddle/v2/paddle.js"]',
    );
    const onReady = () => {
      try {
        const paddleJsEnv = env === "sandbox" ? "sandbox" : "production";
        window.Paddle.Environment.set(paddleJsEnv);
        window.Paddle.Initialize({
          token,
          eventCallback: (eventData: any) => {
            if (activeEventCallback) {
              activeEventCallback(eventData);
            }
          },
        });
        paddleInitialized = true;
        currentEnv = env;
        resolve();
      } catch (e) {
        initPromise = null;
        reject(e);
      }
    };
    if (existing && window.Paddle) {
      onReady();
      return;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
    };

    const script = existing ?? document.createElement("script");
    if (!existing) {
      script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
      script.async = true;
      document.head.appendChild(script);
    }

    timer = setTimeout(() => {
      cleanup();
      initPromise = null;
      reject(new Error("Paddle payment connection timed out. Please check your network and try again."));
    }, 12000);

    script.addEventListener("load", () => {
      cleanup();
      onReady();
    }, { once: true });
    script.addEventListener("error", () => {
      cleanup();
      initPromise = null;
      reject(new Error("Paddle.js failed to load. Please check if an ad-blocker is blocking Paddle."));
    }, { once: true });
  });
  return initPromise;
}

export async function getPaddlePriceId(priceId: string): Promise<string> {
  const environment = getPaddleEnvironment();
  return resolvePaddlePrice({ data: { priceId, environment } });
}
