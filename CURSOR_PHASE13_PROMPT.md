# NEXUS CRM — Phase 13 Cursor Prompt
## Mobile App — React Native + Expo

**Estimated LOC:** ~12,000  
**Location:** `apps/mobile/` (new Expo app in monorepo)  
**Platform:** iOS + Android (Expo managed workflow)

---

## RULES — READ FIRST

- Never truncate. Every screen must be fully implemented.
- Reuse the same React Query hooks pattern as the web app.
- API base URL: `EXPO_PUBLIC_API_URL` env variable via `app.config.ts`.
- Use Expo SDK 52, React Navigation 6, React Query.
- TypeScript strict mode throughout.
- All monetary values: display formatted with `Intl.NumberFormat`.
- After writing all files, run `cd apps/mobile && npx expo export` to verify the build.

---

## SECTION 1 — Project Setup

### 1A: `apps/mobile/package.json`
```json
{
  "name": "@nexus/mobile",
  "version": "1.0.0",
  "private": true,
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start",
    "android": "expo run:android",
    "ios": "expo run:ios",
    "build:preview": "eas build --profile preview --platform all"
  },
  "dependencies": {
    "@expo/vector-icons": "^14.0.0",
    "@react-native-async-storage/async-storage": "^1.23.1",
    "@react-navigation/bottom-tabs": "^6.5.20",
    "@react-navigation/native": "^6.1.17",
    "@react-navigation/native-stack": "^6.9.26",
    "@tanstack/react-query": "^5.51.21",
    "decimal.js": "^10.4.3",
    "expo": "^52.0.0",
    "expo-camera": "^15.0.0",
    "expo-file-system": "^17.0.0",
    "expo-font": "^12.0.0",
    "expo-local-authentication": "^14.0.0",
    "expo-location": "^17.0.0",
    "expo-notifications": "^0.28.0",
    "expo-router": "^4.0.0",
    "expo-secure-store": "^13.0.0",
    "expo-sqlite": "^14.0.0",
    "expo-status-bar": "^1.12.1",
    "react": "18.3.1",
    "react-native": "0.76.5",
    "react-native-gesture-handler": "^2.19.0",
    "react-native-maps": "^1.18.0",
    "react-native-reanimated": "^3.15.0",
    "react-native-safe-area-context": "^4.11.0",
    "react-native-screens": "^3.34.0",
    "react-native-svg": "^15.7.1",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@babel/core": "^7.25.0",
    "@types/react": "~18.3.0",
    "@types/react-native": "^0.73.0",
    "typescript": "^5.6.3"
  }
}
```

### 1B: `apps/mobile/app.config.ts`
```typescript
import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'NEXUS CRM',
  slug: 'nexus-crm',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  splash: { image: './assets/splash.png', backgroundColor: '#1E3A5F' },
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.nexus.crm',
    infoPlist: {
      NSCameraUsageDescription: 'Used for scanning business cards',
      NSLocationWhenInUseUsageDescription: 'Used for check-in at customer locations',
      NSMicrophoneUsageDescription: 'Used for voice notes on activity log',
      NSFaceIDUsageDescription: 'Used for biometric login',
    },
  },
  android: {
    adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#1E3A5F' },
    package: 'com.nexus.crm',
    permissions: ['ACCESS_FINE_LOCATION', 'CAMERA', 'RECORD_AUDIO'],
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    ['expo-notifications', { color: '#1E3A5F' }],
    'expo-location',
  ],
  extra: { eas: { projectId: 'nexus-crm' } },
};

export default config;
```

### 1C: `apps/mobile/tsconfig.json`
```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.d.ts", "expo-env.d.ts"]
}
```

---

## SECTION 2 — App Structure

```
apps/mobile/
├── app/                         ← Expo Router file-based routing
│   ├── _layout.tsx              ← Root layout (Auth gate + QueryClientProvider)
│   ├── (auth)/
│   │   ├── login.tsx
│   │   └── _layout.tsx
│   └── (app)/
│       ├── _layout.tsx          ← Bottom tab navigator
│       ├── index.tsx            ← Dashboard home
│       ├── deals/
│       │   ├── index.tsx        ← Deals list (kanban)
│       │   ├── [id].tsx         ← Deal detail
│       │   └── new.tsx          ← Create deal
│       ├── contacts/
│       │   ├── index.tsx        ← Contacts list
│       │   ├── [id].tsx         ← Contact detail
│       │   └── new.tsx          ← Create contact (with card scanner)
│       ├── accounts/
│       │   ├── index.tsx        ← Accounts list
│       │   └── [id].tsx         ← Account detail
│       ├── activities/
│       │   ├── index.tsx        ← Today + Overdue activities
│       │   └── new.tsx          ← Log activity
│       └── settings/
│           └── index.tsx        ← Profile + preferences
├── src/
│   ├── api/
│   │   └── client.ts            ← Axios/fetch wrapper with JWT
│   ├── hooks/                   ← React Query hooks (mirror web)
│   │   ├── use-deals.ts
│   │   ├── use-contacts.ts
│   │   ├── use-accounts.ts
│   │   └── use-activities.ts
│   ├── stores/
│   │   └── auth.store.ts        ← Zustand auth store (token in SecureStore)
│   ├── components/
│   │   ├── Card.tsx
│   │   ├── StatusBadge.tsx
│   │   ├── EmptyState.tsx
│   │   ├── LoadingSpinner.tsx
│   │   ├── SearchBar.tsx
│   │   └── SwipeableRow.tsx
│   ├── offline/
│   │   └── sync.ts              ← SQLite offline cache + sync queue
│   └── notifications/
│       └── push.ts              ← Expo push notification registration
└── assets/
    ├── icon.png
    └── splash.png
```

---

## SECTION 3 — Core Implementation

### 3A: `src/api/client.ts`
```typescript
import * as SecureStore from 'expo-secure-store';

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await SecureStore.getItemAsync('nexus_access_token');
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error((err as { message?: string }).message ?? 'Request failed');
  }
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => apiRequest<T>(path),
  post: <T>(path: string, body: unknown) =>
    apiRequest<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    apiRequest<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => apiRequest<T>(path, { method: 'DELETE' }),
};
```

### 3B: `src/stores/auth.store.ts`
```typescript
import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

interface AuthState {
  token: string | null;
  user: { id: string; name: string; email: string; role: string } | null;
  setToken: (token: string, user: AuthState['user']) => Promise<void>;
  clearToken: () => Promise<void>;
  loadFromStorage: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  setToken: async (token, user) => {
    await SecureStore.setItemAsync('nexus_access_token', token);
    await SecureStore.setItemAsync('nexus_user', JSON.stringify(user));
    set({ token, user });
  },
  clearToken: async () => {
    await SecureStore.deleteItemAsync('nexus_access_token');
    await SecureStore.deleteItemAsync('nexus_user');
    set({ token: null, user: null });
  },
  loadFromStorage: async () => {
    const token = await SecureStore.getItemAsync('nexus_access_token');
    const userStr = await SecureStore.getItemAsync('nexus_user');
    const user = userStr ? JSON.parse(userStr) : null;
    set({ token, user });
  },
}));
```

### 3C: `app/_layout.tsx`
```tsx
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useAuthStore } from '@/stores/auth.store';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, retry: 1 } },
});

export default function RootLayout() {
  const { loadFromStorage } = useAuthStore();

  useEffect(() => {
    loadFromStorage();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <Stack screenOptions={{ headerShown: false }} />
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
```

### 3D: `app/(auth)/login.tsx` — Full implementation
```tsx
import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import { useAuthStore } from '@/stores/auth.store';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { setToken } = useAuthStore();

  const login = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `${process.env.EXPO_PUBLIC_AUTH_URL ?? 'http://localhost:3001'}/api/v1/auth/login`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        }
      );
      if (!res.ok) throw new Error('Invalid credentials');
      const data = await res.json() as { token: string; user: { id: string; name: string; email: string; role: string } };
      await setToken(data.token, data.user);
      router.replace('/(app)');
    } catch (err) {
      Alert.alert('Login failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const biometricLogin = async () => {
    const supported = await LocalAuthentication.hasHardwareAsync();
    if (!supported) return Alert.alert('Not supported', 'Biometric auth not available on this device');
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Login to NEXUS CRM',
      fallbackLabel: 'Use password',
    });
    if (result.success) {
      // Token already in SecureStore from previous login — just redirect
      router.replace('/(app)');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.card}>
        <Text style={styles.title}>NEXUS CRM</Text>
        <Text style={styles.subtitle}>Sign in to continue</Text>
        <TextInput
          style={styles.input}
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="password"
        />
        <TouchableOpacity style={styles.button} onPress={login} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Sign In</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.biometricBtn} onPress={biometricLogin}>
          <Text style={styles.biometricText}>🔒 Use Face ID / Touch ID</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1E3A5F', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 32 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#1E3A5F', textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#6B7280', textAlign: 'center', marginBottom: 24 },
  input: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, padding: 14, marginBottom: 12, fontSize: 16 },
  button: { backgroundColor: '#1E3A5F', borderRadius: 8, padding: 16, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  biometricBtn: { marginTop: 16, alignItems: 'center' },
  biometricText: { color: '#6B7280', fontSize: 14 },
});
```

### 3E: `app/(app)/_layout.tsx` — Bottom Tab Navigator
```tsx
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function AppLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#1E3A5F',
        tabBarInactiveTintColor: '#9CA3AF',
        headerStyle: { backgroundColor: '#1E3A5F' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="deals/index"
        options={{
          title: 'Deals',
          tabBarIcon: ({ color, size }) => <Ionicons name="briefcase" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="contacts/index"
        options={{
          title: 'Contacts',
          tabBarIcon: ({ color, size }) => <Ionicons name="people" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="activities/index"
        options={{
          title: 'Activities',
          tabBarIcon: ({ color, size }) => <Ionicons name="checkmark-circle" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings/index"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <Ionicons name="settings" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
```

### 3F: `app/(app)/index.tsx` — Dashboard Home
Implement a scrollable dashboard with:
- Greeting: "Good morning, {user.name}" (based on hour of day)
- 4 KPI cards (2×2 grid): Open Deals (count + total value), Today's Activities, Overdue Activities, Leads This Week — fetched from API
- Upcoming Activities list (next 5 due today/tomorrow)
- Quick action buttons row: `+ Lead`, `+ Contact`, `+ Activity`, `+ Note`

### 3G: `app/(app)/deals/index.tsx` — Deals List
Implement a FlatList of deal cards. Each card shows:
- Deal name (bold)
- Account name
- Amount (formatted)
- Stage badge (coloured pill)
- Close date
- Owner avatar initials

Include a search bar at top, stage filter tabs (All / Open / Won / Lost). Pull-to-refresh. Tap → navigate to `deals/[id]`.

"+ New Deal" FAB in bottom-right corner → navigate to `deals/new`.

### 3H: `app/(app)/deals/[id].tsx` — Deal Detail
Implement a scrollable detail page with:
- Header: deal name, amount, stage badge, account link, probability
- Section: Key Details (expected close date, owner, forecast category, source)
- Section: Activities (last 5 linked activities, "Log Activity" button)
- Section: Contacts (linked contacts with roles)
- Section: Notes (last 3 notes, "Add Note" button)
- Bottom action bar: "Move Stage" button (opens a stage picker modal), "Edit" button

### 3I: `app/(app)/contacts/index.tsx` — Contacts List
FlatList with search. Each row: avatar initials circle, full name, job title, company. Pull-to-refresh. "Scan Card" button in header → uses `expo-camera` to scan a business card. Tap row → contact detail.

### 3J: `app/(app)/contacts/new.tsx` — Create Contact (with Card Scanner)
```tsx
// Two modes: Manual entry form OR Business Card Scanner

// SCANNER MODE:
// 1. Uses expo-camera to take a photo
// 2. Sends image as base64 to ai-service: POST /api/v1/ai/extract-business-card
//    Body: { image: base64string }
//    Response: { firstName, lastName, email, phone, jobTitle, company }
// 3. Pre-fills the form with extracted data
// 4. User reviews and submits

// MANUAL MODE:
// Standard form: First Name, Last Name, Email, Phone, Job Title, Company, Account picker
```

Implement both modes. Default to manual; show "Scan Business Card 📷" button to switch to scanner mode. Camera preview fills the top half of screen; below it shows a `Take Photo` button. After photo, show extracted fields for review before creating.

### 3K: `app/(app)/activities/index.tsx` — Today's Activities
FlatList with two sections: "Overdue" (red header) and "Today" (blue header). Each item shows: subject, type icon, linked entity (contact/account name), due time. Pull-to-refresh. Swipe left on item to reveal "Complete" action (calls PATCH to set status=COMPLETED). "Log Activity" FAB → `activities/new.tsx`.

### 3L: `app/(app)/activities/new.tsx` — Log Activity

Includes a **Voice Note** feature:
- Type picker: Call | Email | Meeting | Task | Visit
- Subject input
- Description input — with a `🎙️ Voice Note` button:
  - Tap to start recording (uses `expo-av` Audio recording)
  - Tap again to stop
  - Sends audio file to `ai-service POST /api/v1/ai/transcribe`
  - Transcription populates the description field
- Linked entity picker (contact / account / deal)
- Due date + time picker
- Status picker (Planned / Completed)
- If type = VISIT:
  - "📍 Use current location" button — uses `expo-location` to get GPS coords
  - Stores lat/lng in activity's `customFields.location`

### 3M: `src/offline/sync.ts`
```typescript
import * as SQLite from 'expo-sqlite';

const db = SQLite.openDatabaseSync('nexus_offline.db');

export function initOfflineDb() {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS offline_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      body TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS cached_deals (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      cached_at INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS cached_contacts (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      cached_at INTEGER DEFAULT (unixepoch())
    );
  `);
}

export function queueMutation(method: string, path: string, body?: unknown) {
  db.runSync(
    'INSERT INTO offline_queue (method, path, body) VALUES (?, ?, ?)',
    method,
    path,
    body ? JSON.stringify(body) : null
  );
}

export async function flushQueue(apiFn: typeof import('@/api/client').api) {
  const rows = db.getAllSync<{ id: number; method: string; path: string; body: string | null }>(
    'SELECT * FROM offline_queue ORDER BY id ASC'
  );
  for (const row of rows) {
    try {
      const body = row.body ? JSON.parse(row.body) : undefined;
      if (row.method === 'POST') await apiFn.post(row.path, body);
      if (row.method === 'PATCH') await apiFn.patch(row.path, body);
      if (row.method === 'DELETE') await apiFn.delete(row.path);
      db.runSync('DELETE FROM offline_queue WHERE id = ?', row.id);
    } catch {
      break; // stop on first failure — retry later
    }
  }
}

export function cacheDeals(deals: unknown[]) {
  for (const deal of deals) {
    const d = deal as { id: string };
    db.runSync(
      'INSERT OR REPLACE INTO cached_deals (id, data) VALUES (?, ?)',
      d.id,
      JSON.stringify(d)
    );
  }
}

export function getCachedDeals(): unknown[] {
  return db
    .getAllSync<{ data: string }>('SELECT data FROM cached_deals ORDER BY cached_at DESC LIMIT 100')
    .map((r) => JSON.parse(r.data));
}
```

Call `initOfflineDb()` in `app/_layout.tsx` on startup. When network is available (use `NetInfo.fetch()`), call `flushQueue`.

### 3N: `src/notifications/push.ts`
```typescript
import * as Notifications from 'expo-notifications';
import { api } from '@/api/client';

export async function registerPushToken() {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return;
  const token = await Notifications.getExpoPushTokenAsync({ projectId: 'nexus-crm' });
  await api.post('/api/v1/users/push-token', { token: token.data }).catch(() => undefined);
}

export function setupNotificationHandlers() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}
```

Call both from `app/(app)/_layout.tsx` when user is authenticated.

---

## SECTION 4 — Backend: Push Notification Token Storage

Add to `services/auth-service/prisma/schema.prisma`:
```prisma
model PushToken {
  id        String   @id @default(cuid())
  userId    String
  token     String   @unique
  platform  String   // 'ios' | 'android' | 'expo'
  createdAt DateTime @default(now())

  @@index([userId])
}
```

Add route `POST /api/v1/users/push-token` to auth-service: upserts the push token for the current user.

Add to `notification-service`: when sending a notification, also check for the user's push token and call Expo Push API (`https://exp.host/--/api/v2/push/send`) with the notification payload.

---

## SECTION 5 — Backend: Business Card OCR endpoint

Add to `services/ai-service/main.py`:
```python
@app.post("/api/v1/ai/extract-business-card")
async def extract_business_card(request: Request):
    """Extract contact info from a base64-encoded business card image."""
    body = await request.json()
    image_b64 = body.get("image", "")
    
    # Use Ollama vision model (llava) to extract structured data
    response = requests.post(
        f"{OLLAMA_URL}/api/generate",
        json={
            "model": "llava",
            "prompt": """Extract contact information from this business card image.
Return ONLY a JSON object with these fields (use null if not found):
{ "firstName": "", "lastName": "", "email": "", "phone": "", "jobTitle": "", "company": "", "website": "" }""",
            "images": [image_b64],
            "stream": False,
        },
        timeout=30,
    )
    text = response.json().get("response", "{}")
    # Extract JSON from response
    import re
    match = re.search(r'\{.*\}', text, re.DOTALL)
    if match:
        import json
        data = json.loads(match.group())
        return data
    return {"firstName": None, "lastName": None, "email": None, "phone": None, "jobTitle": None, "company": None}
```

---

## SECTION 6 — Final Verification

```bash
# Install mobile dependencies
cd apps/mobile && npm install

# Type check
cd apps/mobile && npx tsc --noEmit

# Verify all screens exist
ls app/\(app\)/deals/
ls app/\(app\)/contacts/
ls app/\(app\)/activities/

# Verify hooks exist
ls src/hooks/

# Expo doctor check
npx expo-doctor
```

**Deliverable: A fully functional React Native CRM app with offline support, biometric auth, voice notes, GPS check-in, and business card scanning.**
