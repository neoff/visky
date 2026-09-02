// desktop/shell/main.rs
//
// The Tauri shell around the Expo web bundle — the same renderer source the
// phone runs, exported for platform `web`.
//
// It is deliberately much smaller than the Electron shell it replaced — that
// one is still in desktop-electron/ as a fallback — because two of the three
// things Electron was carrying turned out not to be needed here:
//
//   1. an origin to serve the bundle from  -> Tauri does this itself
//      (`tauri://localhost`), so there is no custom protocol handler to write.
//   2. CORS headers for VK's CDN           -> Chromium has no native HLS, so
//      shaka fetches every segment with XHR from the page origin and VK's CDN
//      sends no CORS headers. WKWebView plays HLS natively; shaka hands the
//      manifest to the <video> element, and media loading is not CORS-gated.
//   3. an embedded browser for VK login    -> the desktop never logs in to VK.
//      It is paired from a phone (app/src/app/(auth)/welcome.tsx gates the
//      WebView login behind `Platform.OS !== 'web'`), so the <webview>, its
//      preload and the script-injection IPC have no user here.
//
// What is left is the window itself.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{WebviewUrl, WebviewWindowBuilder};

#[cfg(target_os = "macos")]
use std::process::Command;

#[cfg(target_os = "macos")]
use tauri::{LogicalPosition, TitleBarStyle};

/// A tall portrait slab, the shape of the app on an iPad. Width is pinned —
/// the layout is the phone's one column and has no wide form to grow into —
/// and the height runs from cramped to the full height of the display.
const WINDOW_WIDTH: f64 = 480.0;
const WINDOW_HEIGHT: f64 = 900.0;
const WINDOW_MIN_HEIGHT: f64 = 560.0;
/// Far past any display; the window manager stops the drag at the screen edge.
const WINDOW_MAX_HEIGHT: f64 = 10_000.0;

/// Where the traffic lights sit. DESKTOP_TITLEBAR_HEIGHT in the app matches.
#[cfg(target_os = "macos")]
const TITLEBAR_HEIGHT: f64 = 36.0;

/// The vertical offset that puts the buttons in the MIDDLE of that strip.
///
/// Not simply half of it: tao's origin for this is about 9pt above the one
/// Electron uses, so the same number lands the group high and clipped against
/// the top edge. Measured rather than guessed — the close button's centre in
/// the Electron build sits at 17.8pt from the window top, and this is what puts
/// it there.
#[cfg(target_os = "macos")]
const TRAFFIC_LIGHT_Y: f64 = TITLEBAR_HEIGHT / 2.0 + 2.0;

/// Runs before any of the page's own scripts.
///
/// The bundle asks for exactly one thing from its shell — whether it is in one
/// — and answers two questions with it: whether to draw its own title bar
/// (app/src/components/DesktopChrome.web.tsx) and what to call this device in
/// the picker (app/src/helpers/device.ts). `shell` is there so the two builds
/// can be told apart in a bug report; nothing branches on it.
const BRIDGE: &str = r#"
window.viskyDesktop = {platform: 'macos', shell: 'tauri'};
"#;

/// Keep the window on the app, and hand everything else to the real browser.
///
/// The renderer's own origin is `tauri://localhost`; the only http(s)
/// NAVIGATION it can produce is a link somebody tapped. Letting one through
/// would replace the player with a web page inside a chrome-less window that
/// has no back button — so it is opened outside instead and the navigation is
/// refused.
///
/// This is about navigations only. The API calls, the playback socket and
/// every media segment are requests, not navigations, and never reach here.
fn open_externally_or_allow(url: &tauri::Url) -> bool {
    let scheme = url.scheme();
    if scheme != "http" && scheme != "https" {
        return true;
    }

    #[cfg(target_os = "macos")]
    {
        // Fire and forget: whether the browser opened is the browser's problem,
        // and the player must not stall on it either way.
        let _ = Command::new("open").arg(url.as_str()).spawn();
    }

    false
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title("visky")
                .inner_size(WINDOW_WIDTH, WINDOW_HEIGHT)
                // Equal min and max width is what makes the resize
                // vertical-only: macOS then offers no horizontal handle at all.
                .min_inner_size(WINDOW_WIDTH, WINDOW_MIN_HEIGHT)
                .max_inner_size(WINDOW_WIDTH, WINDOW_MAX_HEIGHT)
                .resizable(true)
                // Painted before the first frame, so launching does not flash
                // white at somebody sitting in a dark room.
                .background_color(tauri::window::Color(0, 0, 0, 255))
                .initialization_script(BRIDGE)
                .on_navigation(open_externally_or_allow);

            // No system title bar: the artwork runs to the top edge and the app
            // draws its own drag strip under the traffic lights.
            #[cfg(target_os = "macos")]
            let builder = builder
                .title_bar_style(TitleBarStyle::Overlay)
                .hidden_title(true)
                .traffic_light_position(LogicalPosition::new(13.0, TRAFFIC_LIGHT_Y));

            builder.build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("visky: the shell could not start");
}
