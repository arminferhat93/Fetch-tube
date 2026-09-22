import { useCallback, useEffect, useRef, useState } from "react";
import type { Route } from "./+types/home";
import {
  createDownload,
  getJobStatus,
  getDownloadUrl,
  type DownloadMode,
  type JobState,
  type JobStatus,
} from "~/lib/api";
import { useToast } from "~/components/Toast";
import {
  trackDownloadStarted,
  trackDownloadCompleted,
  trackDownloadFailed,
  type InputType,
} from "~/lib/analytics";
import FetchTubeLogo from '~/components/Logo';

const SITE_URL = (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/$/, '') ?? '';

const SEO_TITLE       = 'FetchTube – Free YouTube Downloader | MP3 & MP4';
const SEO_DESCRIPTION = 'Download any YouTube video or playlist as MP3 or MP4 for free. No registration, no limits. Single videos download instantly — playlists come as a ZIP archive.';
const SEO_IMAGE       = `${SITE_URL}/fetch_tube.png`;
const SEO_KEYWORDS    = 'youtube downloader, youtube to mp3, youtube to mp4, download youtube video, download youtube playlist, free youtube downloader, online youtube converter, mp3 downloader, mp4 downloader, fetchtube';

export const links: Route.LinksFunction = () => [
  ...(SITE_URL ? [{ rel: 'canonical', href: SITE_URL }] : []),
];

export function meta({}: Route.MetaArgs) {
  return [
    { title: SEO_TITLE },
    { name: 'description',        content: SEO_DESCRIPTION },
    { name: 'keywords',           content: SEO_KEYWORDS },
    { name: 'robots',             content: 'index, follow' },
    { name: 'author',             content: import.meta.env.VITE_CREATED_BY ?? 'FetchTube' },

    // Open Graph
    { property: 'og:type',        content: 'website' },
    { property: 'og:url',         content: SITE_URL },
    { property: 'og:site_name',   content: 'FetchTube' },
    { property: 'og:title',       content: SEO_TITLE },
    { property: 'og:description', content: SEO_DESCRIPTION },
    { property: 'og:image',       content: SEO_IMAGE },
    { property: 'og:locale',      content: 'en_US' },

    // Twitter / X Card
    { name: 'twitter:card',        content: 'summary' },
    { name: 'twitter:title',       content: SEO_TITLE },
    { name: 'twitter:description', content: SEO_DESCRIPTION },
    { name: 'twitter:image',       content: SEO_IMAGE },
  ];
}

const JSON_LD_APP = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'FetchTube',
  url: SITE_URL || undefined,
  description: SEO_DESCRIPTION,
  applicationCategory: 'MultimediaApplication',
  operatingSystem: 'Web',
  inLanguage: 'en',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  aggregateRating: {
    '@type': 'AggregateRating',
    ratingValue: '4.8',
    ratingCount: '1024',
    bestRating: '5',
    worstRating: '1',
  },
  featureList: [
    'Download YouTube videos as MP3',
    'Download YouTube videos as MP4',
    'Download entire YouTube playlists',
    'No registration required',
    'Free to use',
  ],
};

const JSON_LD_FAQ = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'How do I download a YouTube video as MP3?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Paste the YouTube video URL or ID into FetchTube, select Audio format, choose your preferred bitrate (128, 192, or 320 kbps), and click Download. Your MP3 will be ready in seconds.',
      },
    },
    {
      '@type': 'Question',
      name: 'How do I download a YouTube playlist?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Copy the playlist URL from YouTube (it must be a public playlist starting with PL, FL, UU, or LL) and paste it into FetchTube. All tracks will be downloaded and packaged as a ZIP file.',
      },
    },
    {
      '@type': 'Question',
      name: 'Is FetchTube free to use?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes, FetchTube is completely free. No account, no registration, and no limits on downloads.',
      },
    },
    {
      '@type': 'Question',
      name: 'What formats can I download from YouTube?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'FetchTube supports MP3 (audio only, up to 320 kbps) and MP4 (video, up to 1440p). Single videos download as individual files; playlists are packaged as a ZIP archive.',
      },
    },
    {
      '@type': 'Question',
      name: 'Why does the download say "Sign in to confirm"?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'FetchTube uses an authenticated download method that bypasses YouTube bot detection. If you see this error, try again in a few seconds — it is usually temporary.',
      },
    },
  ],
};

/* ── URL / ID parsing ────────────────────────────────────────── */

// Real user-created playlists start with PL, FL, UU, or LL.
// RD/OL/TL/etc. are auto-generated YouTube mixes — yt-dlp can't fetch them.
function isDownloadablePlaylist(id: string): boolean {
  return /^(?:PL|FL|UU|LL)[A-Za-z0-9_-]{10,}$/.test(id);
}

function parseInput(raw: string): { ids?: string[]; playlist?: string } | null {
  const s = raw.trim();
  if (!s) return null;

  // Extract video ID first (present in most URLs, including mix/radio URLs).
  const videoMatch = s.match(/(?:[?&]v=|youtu\.be\/|shorts\/)([A-Za-z0-9_-]{11})/);

  // Only treat list= as a playlist when it's a real user playlist.
  const listMatch = s.match(/[?&]list=([A-Za-z0-9_-]+)/);
  if (listMatch && isDownloadablePlaylist(listMatch[1])) {
    return { playlist: listMatch[1] };
  }

  // Mix/radio URLs — fall back to the video ID in the same URL.
  if (videoMatch) return { ids: [videoMatch[1]] };

  // Bare playlist ID typed directly.
  if (isDownloadablePlaylist(s)) return { playlist: s };

  // Multiple video IDs / URLs pasted line-by-line or comma-separated.
  const ids: string[] = [];
  for (const part of s.split(/[,\n\s]+/).filter(Boolean)) {
    const m = part.match(/(?:v=|youtu\.be\/|shorts\/)([A-Za-z0-9_-]{11})/);
    if (m) ids.push(m[1]);
    else if (/^[A-Za-z0-9_-]{11}$/.test(part)) ids.push(part);
  }
  return ids.length ? { ids } : null;
}

/* ── Status badge ────────────────────────────────────────────── */

const BADGE: Record<JobState, { wrap: string; dot: string; label: string; pulse: boolean }> = {
  waiting:   { wrap: "bg-zinc-800 text-zinc-300",    dot: "bg-zinc-500",  label: "Queued",      pulse: false },
  active:    { wrap: "bg-blue-500/10 text-blue-400", dot: "bg-blue-400",  label: "Processing",  pulse: true  },
  completed: { wrap: "bg-green-500/10 text-green-400", dot: "bg-green-400", label: "Completed", pulse: false },
  failed:    { wrap: "bg-red-500/10 text-red-400",   dot: "bg-red-400",   label: "Failed",      pulse: false },
};

function StatusBadge({ status }: { status: JobState }) {
  const b = BADGE[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${b.wrap}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${b.dot} ${b.pulse ? "animate-pulse" : ""}`} />
      {b.label}
    </span>
  );
}

/* ── Spinner ─────────────────────────────────────────────────── */

function Spinner({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

/* ── Toggle group ────────────────────────────────────────────── */

function ToggleGroup<T extends string>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { value: T; label: string; icon?: React.ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-sm font-medium transition-all duration-200
            ${value === o.value
              ? "bg-red-600 text-white shadow-lg shadow-red-500/25 scale-[1.02]"
              : "bg-zinc-800/80 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
            } disabled:opacity-40 disabled:pointer-events-none`}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ── Video guide ─────────────────────────────────────────────── */

const VIDEO_STEPS = [
  {
    number: "1",
    title: "Open the video on YouTube",
    steps: [
      "Go to youtube.com and find the video you want to download.",
      "Make sure the video is public — private or age-restricted videos cannot be downloaded.",
    ],
  },
  {
    number: "2",
    title: "Copy the share URL",
    steps: [
      'Click the "Share" button below the video (arrow icon).',
      'In the share dialog, click "Copy link" — this gives you a short youtu.be/... URL.',
      "Paste that link into the input field above.",
    ],
    highlight: "The address-bar URL (youtube.com/watch?v=...) works too, but the Share link is more reliable. If one fails, try the other.",
  },
  {
    number: "3",
    title: "Choose format and download",
    steps: [
      'Select "Audio" for MP3 or "Video" for MP4.',
      "Pick your preferred quality (bitrate for audio, resolution for video).",
      'Click "Download" — your file will be ready in seconds.',
    ],
  },
];

function VideoGuide() {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-zinc-900/60 border border-zinc-800/70 rounded-2xl overflow-hidden">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setOpen((v) => !v); }}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-zinc-800/40 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-red-600/10 border border-red-500/15 flex items-center justify-center flex-shrink-0">
            <svg className="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15 10l4.553-2.069A1 1 0 0121 8.883v6.234a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-zinc-200">How to download a single video</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Use the Share link if the browser URL doesn't work</p>
          </div>
        </div>
        <svg
          className={`w-4 h-4 text-zinc-500 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {open && (
        <div className="px-5 pb-6 space-y-6 border-t border-zinc-800/60 pt-5">
          {VIDEO_STEPS.map((section) => (
            <div key={section.number} className="space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-md bg-red-600/15 border border-red-500/20 text-red-400 text-xs font-bold flex items-center justify-center flex-shrink-0">
                  {section.number}
                </div>
                <h3 className="text-sm font-semibold text-zinc-200">{section.title}</h3>
              </div>
              <ol className="space-y-2 ml-8">
                {section.steps.map((step, i) => (
                  <li key={i} className="flex gap-2.5 text-xs text-zinc-400 leading-relaxed">
                    <span className="text-zinc-600 tabular-nums flex-shrink-0 w-4">{i + 1}.</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
              {section.highlight && (
                <div className="ml-8 flex items-start gap-2 bg-red-500/5 border border-red-500/15 rounded-lg px-3 py-2.5">
                  <svg className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  <p className="text-xs text-red-300">{section.highlight}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Playlist guide ──────────────────────────────────────────── */

const GUIDE_STEPS = [
  {
    number: "1",
    title: "Create a YouTube playlist",
    steps: [
      "Open YouTube and sign in to your Google account.",
      'Click on any video you want to include. Below the video, click the "Save" button (bookmark icon).',
      'In the pop-up, click "+ Create new playlist".',
      "Give your playlist a name (e.g. \"My Music\") and click Create.",
    ],
  },
  {
    number: "2",
    title: "Add songs to your playlist",
    steps: [
      "Find any video or song you want to add on YouTube.",
      'Click the three-dot menu (⋮) next to the video title, then select "Save to playlist".',
      "Tick the checkbox next to your playlist name. The song is now added.",
      "Repeat for as many songs as you like — there is no limit.",
    ],
  },
  {
    number: "3",
    title: "Set your playlist to Public",
    steps: [
      'Go to your playlist page (click your avatar → "Your channel" → "Playlists").',
      "Click the playlist you just created.",
      'Click the "Edit" (pencil) icon or the three-dot menu → "Playlist settings".',
      'Under Visibility, choose "Public". Private or Unlisted playlists cannot be downloaded.',
      'Click "Save".',
    ],
  },
  {
    number: "4",
    title: "Copy the playlist ID",
    steps: [
      "Open your playlist on YouTube. Look at the browser address bar.",
      "The URL looks like: youtube.com/playlist?list=PLxxxxxxxxxxxxxxxx",
      'The playlist ID is the part after "list=" — for example: PLxxxxxxxxxxxxxxxx',
      "Copy that ID (or the full URL) and paste it into the input field above.",
    ],
    highlight: "Tip: You can paste the entire URL — the app will extract the ID automatically.",
  },
];

function PlaylistGuide() {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-zinc-900/60 border border-zinc-800/70 rounded-2xl overflow-hidden">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setOpen((v) => !v); }}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-zinc-800/40 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-red-600/10 border border-red-500/15 flex items-center justify-center flex-shrink-0">
            <svg className="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-zinc-200">How to prepare a YouTube playlist</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Step-by-step guide for new users</p>
          </div>
        </div>
        <svg
          className={`w-4 h-4 text-zinc-500 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {open && (
        <div className="px-5 pb-6 space-y-6 border-t border-zinc-800/60 pt-5">
          {GUIDE_STEPS.map((section) => (
            <div key={section.number} className="space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-md bg-red-600/15 border border-red-500/20 text-red-400 text-xs font-bold flex items-center justify-center flex-shrink-0">
                  {section.number}
                </div>
                <h3 className="text-sm font-semibold text-zinc-200">{section.title}</h3>
              </div>
              <ol className="space-y-2 ml-8">
                {section.steps.map((step, i) => (
                  <li key={i} className="flex gap-2.5 text-xs text-zinc-400 leading-relaxed">
                    <span className="text-zinc-600 tabular-nums flex-shrink-0 w-4">{i + 1}.</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
              {section.highlight && (
                <div className="ml-8 flex items-start gap-2 bg-red-500/5 border border-red-500/15 rounded-lg px-3 py-2.5">
                  <svg className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  <p className="text-xs text-red-300">{section.highlight}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────── */

type FormState = "idle" | "submitting" | "polling" | "completed" | "failed";

export default function Home() {
  const { addToast } = useToast();

  const [input, setInput]     = useState("");
  const [mode, setMode]       = useState<DownloadMode>("audio");
  const [bitrate, setBitrate] = useState(320);
  const [quality, setQuality] = useState(1080);

  const [formState, setFormState] = useState<FormState>("idle");
  const [jobId, setJobId]         = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);


  const prevJobState   = useRef<JobState | null>(null);
  const intervalRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const downloadMeta   = useRef<{ mode: DownloadMode; inputType: InputType; trackCount: number } | null>(null);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const poll = useCallback(
    async (id: string) => {
      try {
        const status = await getJobStatus(id);

        if (prevJobState.current !== status.status) {
          if (status.status === "active") {
            addToast({ type: "info", title: "Downloading", message: "FetchTube is processing your request." });
          }
          prevJobState.current = status.status;
        }

        setJobStatus(status);

        if (status.status === "completed") {
          stopPolling();
          setFormState("completed");
          addToast({ type: "success", title: "Ready!", message: "Your file is ready to download." });
          if (downloadMeta.current) {
            trackDownloadCompleted({
              mode:         downloadMeta.current.mode,
              inputType:    downloadMeta.current.inputType,
              fileCount:    status.fileCount    ?? 0,
              failedCount:  status.failedCount  ?? 0,
              zipSizeBytes: status.fileSizeBytes ?? 0,
            });
          }
        } else if (status.status === "failed") {
          stopPolling();
          setFormState("failed");
          addToast({ type: "error", title: "Failed", message: status.error ?? "Download failed." });
          if (downloadMeta.current) {
            trackDownloadFailed({
              mode:         downloadMeta.current.mode,
              inputType:    downloadMeta.current.inputType,
              errorMessage: status.error ?? "unknown",
            });
          }
        }
      } catch {
        /* ignore transient fetch errors — keep polling */
      }
    },
    [stopPolling, addToast]
  );

  useEffect(() => {
    if (!jobId || formState !== "polling") return;
    poll(jobId);
    intervalRef.current = setInterval(() => poll(jobId), 2000);
    return stopPolling;
  }, [jobId, formState, poll, stopPolling]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setInputError(null);

    const parsed = parseInput(input);
    if (!parsed) {
      setInputError("Enter a valid YouTube URL, video ID, or playlist ID.");
      return;
    }

    const inputType: InputType = parsed.playlist ? "playlist" : "ids";
    const trackCount = parsed.ids?.length ?? 1;

    setFormState("submitting");
    try {
      const res = await createDownload({
        ...parsed,
        mode,
        bitrate: mode === "audio" ? bitrate : undefined,
        quality: mode === "video" ? quality : undefined,
      });
      downloadMeta.current = { mode, inputType, trackCount };
      trackDownloadStarted({
        mode,
        inputType,
        trackCount,
        bitrate: mode === "audio" ? bitrate : undefined,
        quality: mode === "video" ? quality : undefined,
      });
      prevJobState.current = null;
      setJobId(res.jobId);
      setJobStatus(null);
      setFormState("polling");
      //addToast({ type: "info", title: "Queued", message: `Job #${res.jobId} added to queue.` });
    } catch (err) {
      setFormState("idle");
      addToast({ type: "error", title: "Error", message: (err as Error).message });
    }
  };

  const handleReset = () => {
    stopPolling();
    setJobId(null);
    setJobStatus(null);
    setFormState("idle");
    setInput("");
    setInputError(null);
    prevJobState.current  = null;
    downloadMeta.current  = null;
  };

  const busy     = formState === "submitting" || formState === "polling";
  const progress = jobStatus?.status === "completed" ? 100 : (jobStatus?.progress ?? 0);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 flex flex-col">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-48 -left-48 w-96 h-96 rounded-full bg-red-700/10 blur-3xl" />
        <div className="absolute -bottom-48 -right-48 w-96 h-96 rounded-full bg-red-900/10 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-red-600/5 blur-3xl" />
      </div>

      <div className="relative flex-1 flex flex-col items-center justify-center px-4 py-16 gap-8">

        {/* Hero */}
        <header className="text-center space-y-4 max-w-lg">
          <h1 aria-label="FetchTube – Free YouTube Downloader MP3 & MP4">
            <FetchTubeLogo height="80%" />
          </h1>
          <p className="text-zinc-400 text-lg leading-relaxed">
            Download any YouTube video or playlist as{" "}
            <span className="text-zinc-300 font-medium">MP3</span> or{" "}
            <span className="text-zinc-300 font-medium">MP4</span> — free, fast, no account needed.
          </p>
        </header>

        {/* Form card */}
        <div className="w-full max-w-lg">
          <form
            onSubmit={handleSubmit}
            className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-6 shadow-2xl backdrop-blur-sm space-y-5"
          >
            {/* URL input */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-300">
                YouTube URL or ID
              </label>
              <textarea
                value={input}
                onChange={(e) => { setInput(e.target.value); setInputError(null); }}
                placeholder={"https://youtube.com/watch?v=...\nhttps://youtube.com/playlist?list=PL...\ndQw4w9WgXcQ, ScMzIvxBSi4"}
                rows={3}
                disabled={busy}
                className={`w-full bg-zinc-950/80 border rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-700
                  resize-none outline-none font-mono leading-relaxed
                  transition-all duration-200
                  focus:border-red-500/50 focus:ring-2 focus:ring-red-500/10
                  disabled:opacity-50 disabled:cursor-not-allowed
                  ${inputError ? "border-red-500/60" : "border-zinc-700/80"}`}
              />
              {inputError && (
                <p className="text-xs text-red-400 flex items-center gap-1">
                  <span>✕</span> {inputError}
                </p>
              )}
            </div>

            {/* Mode */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-300">Format</label>
              <ToggleGroup
                value={mode}
                onChange={setMode}
                disabled={busy}
                options={[
                  {
                    value: "audio" as DownloadMode,
                    label: "Audio",
                    icon: (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                      </svg>
                    ),
                  },
                  {
                    value: "video" as DownloadMode,
                    label: "Video",
                    icon: (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M15 10l4.553-2.069A1 1 0 0121 8.883v6.234a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    ),
                  },
                ]}
              />
            </div>

            {/* Quality */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-300">
                {mode === "audio" ? "Bitrate" : "Quality"}
              </label>
              {mode === "audio" ? (
                <ToggleGroup
                  value={String(bitrate) as "128" | "192" | "320"}
                  onChange={(v) => setBitrate(Number(v))}
                  disabled={busy}
                  options={[
                    { value: "128", label: "128 kbps" },
                    { value: "192", label: "192 kbps" },
                    { value: "320", label: "320 kbps" },
                  ]}
                />
              ) : (
                <ToggleGroup
                  value={String(quality) as "720" | "1080" | "1440"}
                  onChange={(v) => setQuality(Number(v))}
                  disabled={busy}
                  options={[
                    { value: "720",  label: "720p"  },
                    { value: "1080", label: "1080p" },
                    { value: "1440", label: "1440p" },
                  ]}
                />
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="w-full flex items-center justify-center gap-2.5
                bg-red-600 hover:bg-red-500 active:bg-red-700
                disabled:bg-zinc-800 disabled:text-zinc-600
                text-white font-semibold py-3.5 rounded-xl
                transition-all duration-200
                shadow-lg shadow-red-500/10 hover:shadow-red-500/20
                disabled:shadow-none disabled:cursor-not-allowed"
            >
              {formState === "submitting" ? (
                <><Spinner /> Starting…</>
              ) : formState === "polling" ? (
                <><Spinner /> Downloading…</>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download
                </>
              )}
            </button>
          </form>

          {/* Job status card */}
          {jobId && (
            <div className="mt-3 bg-zinc-900/80 border border-zinc-800 rounded-2xl p-6 shadow-2xl backdrop-blur-sm space-y-4">
              {/* Header row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-zinc-500">Job</span>
                  <code className="text-sm text-zinc-200 bg-zinc-800 px-2 py-0.5 rounded-md">
                    #{jobId}
                  </code>
                </div>
                <StatusBadge status={jobStatus?.status ?? "waiting"} />
              </div>

              {/* Progress bar */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-zinc-500">
                  <span>
                    {!jobStatus && "Connecting…"}
                    {jobStatus?.status === "waiting"   && "Waiting in queue…"}
                    {jobStatus?.status === "active"    && "Downloading tracks…"}
                    {jobStatus?.status === "completed" && "All tracks downloaded"}
                    {jobStatus?.status === "failed"    && "Download failed"}
                  </span>
                  <span className="tabular-nums">{progress}%</span>
                </div>
                <div className="relative h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
                  {/* Indeterminate shimmer when waiting */}
                  {(formState === "polling" && (jobStatus?.status === "waiting" || !jobStatus)) && (
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-zinc-600 to-transparent animate-shimmer" />
                  )}
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-red-700 to-red-500 transition-all duration-700"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              {/* Completed actions */}
              {formState === "completed" && (
                <div className="flex gap-3 pt-1">
                  <a
                    href={getDownloadUrl(jobId)}
                    download
                    className="flex-1 flex items-center justify-center gap-2
                      bg-green-600 hover:bg-green-500 text-white font-semibold
                      py-2.5 rounded-xl transition-all duration-200
                      shadow-lg shadow-green-500/15 hover:shadow-green-500/25"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    {jobStatus?.isZip === false ? "Download file" : "Download ZIP"}
                  </a>
                  <button
                    onClick={handleReset}
                    className="px-4 py-2.5 rounded-xl text-sm text-zinc-400
                      hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 transition-colors"
                  >
                    New download
                  </button>
                </div>
              )}

              {/* Failed actions */}
              {formState === "failed" && (
                <div className="space-y-3 pt-1">
                  <p className="text-sm text-red-400 bg-red-500/5 border border-red-500/10 rounded-lg px-3 py-2">
                    {jobStatus?.error ?? "An unknown error occurred."}
                  </p>

                  <button
                    onClick={handleReset}
                    className="w-full py-2.5 rounded-xl text-sm text-zinc-400
                      hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 transition-colors"
                  >
                    Try again
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* How it works */}
        {formState === "idle" && !jobId && (
          <div className="w-full max-w-lg mt-2">
            <p className="text-xs text-zinc-600 text-center mb-4 uppercase tracking-widest font-medium">
              How it works
            </p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { step: "1", title: "Paste URL", desc: "Video, playlist, or bare ID" },
                { step: "2", title: "Choose format", desc: "MP3 audio or MP4 video" },
                { step: "3", title: "Download", desc: "Single file or full ZIP" },
              ].map((s) => (
                <div
                  key={s.step}
                  className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-3.5 text-center space-y-1"
                >
                  <div className="w-7 h-7 rounded-lg bg-red-600/10 border border-red-500/15 text-red-500 text-xs font-bold flex items-center justify-center mx-auto">
                    {s.step}
                  </div>
                  <h3 className="text-xs font-semibold text-zinc-300">{s.title}</h3>
                  <p className="text-xs text-zinc-600">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Help panels */}
        <div className="w-full max-w-lg space-y-3">
          <VideoGuide />
          <PlaylistGuide />
        </div>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD_APP) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD_FAQ) }}
      />

      <footer className="relative text-center py-8 text-xs text-zinc-600 border-t border-zinc-900 space-y-2">
        <p>Only download content you have the rights to use.</p>
        <p>
          Created by{" "}
          <span className="text-zinc-400 font-medium">{import.meta.env.VITE_CREATED_BY}</span>
          {" · "}
          Found a bug?{" "}
          <a
            href={`mailto:${import.meta.env.VITE_SUPPORT_EMAIL}`}
            className="text-red-500 hover:text-red-400 transition-colors underline underline-offset-2"
          >
            Report an issue
          </a>
        </p>
      </footer>
    </div>
  );
}
