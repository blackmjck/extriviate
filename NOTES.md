# General Design Notes

## Overview

In considering the UI, I think there should be two modes of play for an active game with slightly different behaviors and rules.

1. **Computer hosted play.** In this mode, most of the interactions are click-based or text-based with the designated player clicking a question to start a round, the question being automatically revealed, players racing to click the traditional big red button to buzz in first, submitting their answer via text box, and being awarded or penalized points based on correct answers. If the first to buzz in fails, then the one who was second to do so gets the opportunity for the same. Every player gets one chance to buzz in per round, only restricted by the round timer which begins counting down from 10 seconds at the moment they successfully buzz in. The counter resets for the next player afterwards until all players have gone or 10 seconds have elapsed with no one playing, at which time the question round times out and players are notified. If there was a winner, then the round ends and the winner chooses the next question. If not, then the player who started the round begins the next one. Play continues until all questions have been played.
2. **User hosted play.** This mode is much more free-form and less rigid. In this mode, the game and board are controlled by the host player, who designates the question for each round, decides whether a user's verbal or textual answer is valid for the round (with no timers involved), and can manually assign turns to a player at will. Optionally the host may designate the style of play to be turn-based rather than a race to the buzzer, allowing for a more fair style of play when connection latency is considered. There are no time outs in this mode but otherwise the play more closely resembles that of the original game show on which it is based. This is meant to allow hosts and players a slower paced fun party game that is more accommodating and less frustrating for users.

In both cases, the following conditions should be considered as well:

- In the UI during an active session, the majority of the screen is represented by the game board. Either above, below, or along one side of it should reside the gallery of players. These are represented by a square containing either an image avatar, a streaming video feed from the player's camera, or a simple colored block with a single capital letter in the center representing the first character of their display name. Below each square is the player's display name.
- The player who is selecting the next question or who is answering the current question is visually distinguished by a thick glowing red border around their square.
- When answering a question, the player who is attempting to answer is given a large text input box in the lower middle of the screen. For all players, the question round timer is displayed overlaying the screen in one of the upper corners. When the answer is submitted, all players will see it pop up on the screen in the form of a large speech bubble originating from the submitting player's square. In player hosted mode, this only appears if answers are submitted textually and not verbally.
- Users should be able at any time to change the display style of their square between the three options as well as to start or stop their camera feed. All players (and host if applicable) should also have an audio connection which they can choose to mute at any time. In this way the game resembles a meeting app and allows freer player/player and player/host interactions.

## Topical Q&A

### I. Fuzzy answer evaluation logic (for computer-hosted sessions)

In real Jeopardy games, players must format the answer in the form of a question (e.g. "What is daylight savings time" or "Who was Richard the third") while most casual variants do not enforce this rule. More concerning is the flexible interpretation of answers; while a human host might accept for the question "In March most U.S. states spring forward due to this" answers ranging from "daylight savings" and "daylight savings time" to "DST" in any combination of formats, how can I get the computer host to do so in a flexible way?

#### Summary of Options

| Option                  | Catches                            | Misses                  | Latency   | Cost           |
| ----------------------- | ---------------------------------- | ----------------------- | --------- | -------------- |
| Normalized exact        | Case, punctuation, Jeopardy format | Everything else         | ~0ms      | Free           |
| Fuzzy (Levenshtein)     | Typos, minor misspellings          | Abbreviations, synonyms | ~1ms      | Free           |
| Creator-defined answers | Whatever creator listed            | Unanticipated phrasings | ~1ms      | Creator effort |
| Token overlap           | Word order, partial answers        | Synonyms, abbreviations | ~1ms      | Free           |
| AI (Haiku)              | Everything                         | Nothing meaningful      | 300–800ms | ~$0.00015/call |

The layered approach gives you near-instant evaluation for the common case, graceful handling of typos and abbreviations via fuzzy and token matching, and AI as a reliable safety net for genuinely ambiguous cases — all while keeping cost negligible and latency acceptable within a 10-second answer window.

---

### II. Handling verbal input for answers (for computer-hosted sessions)

#### The Timing Problem

All server-side options share a latency challenge specific to your game. Consider the sequence:

1. Player buzzes in — timer starts (10 seconds)
2. Player speaks their answer
3. Player clicks "done" or pauses
4. Audio uploads to server
5. STT API call
6. Text result returned
7. Evaluation runs
8. Result broadcast

Steps 4–6 consume 0.5–2 seconds of the timer, meaning a player who speaks a correct answer with 1 second left on the clock might time out before their answer is evaluated.

**Solutions:**

**Extend the timer for voice answers** — when a player activates voice input, add a fixed buffer (e.g. 5 extra seconds) to account for transcription time. Simple and honest.

**Stop the timer on submission, not on evaluation** — the timer governs when the player must submit (stop recording), not when the result arrives. Record the submission timestamp, and if the player clicked stop before the timer expired, evaluate regardless of how long transcription takes. This requires tracking submission time server-side.

**Show optimistic interim results** — if using a streaming API, show interim text in real time and evaluate the interim transcript immediately while final transcription completes. In practice this means a near-instant evaluation that might update slightly as the final transcript arrives.

**The second approach** — stopping the timer on submission rather than evaluation — is the most correct and fair. It also mirrors how the existing text answer flow works, since submitting text and evaluating text are already two separate steps in the pipeline.

##### Privacy and Permission Considerations

A few practical issues worth flagging before implementation:

**Microphone permission** — browsers require explicit user permission for microphone access. Players who decline or whose browser blocks permission need a fallback to text input. This should never be a hard dependency.

**Always-on vs. push-to-talk** — the game already has an audio connection for voice chat. If a player's microphone is already live for game communication, you need to decide whether voice answers are captured from the ongoing stream or from a dedicated push-to-talk activation. Push-to-talk is simpler and avoids accidentally capturing background conversation as an answer submission. (Prefer the push-to-talk method for this)

**Data retention** — if you're forwarding audio to an external API, your privacy policy should disclose this. For a party game this is rarely a concern in practice but worth noting.

##### Recommendation

Given your stack and deployment context, the pragmatic path is:

**Phase 1:** Web Speech API with text input fallback. Zero cost, works for Chrome users (the majority), gives you the feature immediately.

**Phase 2:** Add OpenAI Whisper API as the backend transcription path for browsers where Web Speech API isn't available, activated automatically as a fallback. (defer for later iterations)

**Phase 3:** If the game gains real users and you want best-in-class accuracy, migrate the backend path to Deepgram streaming for real-time partial results. (defer for even later iterations if ever)

The evaluation pipeline already accepts a plain text string — none of these phases require any changes to the evaluation service. STT is purely a text-production mechanism that feeds into the existing answer flow.

The layered evaluation service handles the rest — the fuzzy matching and AI evaluation layers are particularly well-suited to STT output, which tends to produce phonetically correct but sometimes orthographically variant results (e.g. "daylight savings" vs "daylight saving").

---

### III. Lost/dropped connections during play

**The Problem Has Several Distinct Layers.** Disconnection isn't a single event — it's a spectrum, and each layer needs its own handling strategy:

**Layer 1 — Transient blip (< 2 seconds):** WiFi hiccup, brief packet loss. The WebSocket drops and immediately reconnects. The player barely notices.

**Layer 2 — Short disconnection (2–30 seconds):** Mobile network handoff, router restart, brief ISP issue. The player is gone long enough to miss game events but returns quickly.

**Layer 3 — Extended disconnection (30 seconds to several minutes):** Power outage, ISP problem, phone call on cellular. The player may or may not return.

**Layer 4 — Permanent disconnection:** Player closed the tab, their device died, they gave up. They are not coming back this session.

The challenge is that from the server's perspective, layers 1 through 4 are initially indistinguishable. A dropped WebSocket looks the same whether the player is coming back in one second or never.

**The Host Disconnecting;** The host disconnecting is a special case because in user hosted mode the host controls the game flow. Without the host, the game cannot progress.

**Best practice approaches:**

**Pause the game** — when the host disconnects, transition the session to a paused state and notify all players. The game resumes when the host reconnects within the grace period.

**Host migration** — allow the host to designate a backup host before the game starts, or allow players to vote to promote someone to host if the original host's grace period expires. This is complex but prevents a single player from being able to accidentally ruin the game for everyone.

**Dissolve on extended absence** — if the host never returns within a longer timeout (say, 5 minutes), mark the session as completed with current scores and notify remaining players.

For a party game the simplest approach is pause-and-wait.

**Summary of Best Practices**

| Concern                                 | Approach                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------- |
| Brief disconnection                     | Grace period timer before removing player                                       |
| Reconnection                            | Full state snapshot on reconnect, not event replay                              |
| Active player disconnects               | Forfeit their turn, advance game state                                          |
| Question selecter disconnects           | Reassign to highest-scoring remaining player                                    |
| All clients reconnecting simultaneously | Exponential backoff with jitter                                                 |
| Host disconnects                        | Pause session, resume on reconnect                                              |
| Permanent disconnection                 | Remove after grace period, continue game                                        |
| Client message during disconnect        | Queue pending messages, flush on reconnect                                      |
| UI feedback                             | `player_disconnected` message triggers visual indicator without removing player |

The overarching principle is optimism with a timeout — assume every disconnected player is coming back, hold their place, but don't let the game freeze indefinitely waiting for them.

---

### IV. Guest player reconnection

#### What Makes Guest Identity Hard

With an authenticated user you have:

- A password they know
- A JWT they were issued
- A user ID tied to a database record

With a guest you have:

- A display name (not unique, not secret)
- A session player ID (numeric, guessable)
- Nothing else — by definition they didn't want to create an account

The challenge is giving them something unforgeable without requiring them to authenticate in the traditional sense.

#### The Solution: Guest Session Tokens

Issue guests a short-lived signed token at join time, exactly like a JWT but scoped only to their session player identity. They store it client-side and present it when reconnecting. The server verifies the signature — if it matches, identity is confirmed.

This is the same mechanism used by services like Google Meet for anonymous participants — you get a temporary credential that proves "you were the one who originally joined" without requiring an account.

The result is that guests get meaningful identity protection that's proportional to the stakes — strong enough that no one can accidentally or deliberately steal another player's score, lightweight enough that it requires nothing from the player beyond joining once.

---

### V. Readiness gate-keeping

#### The Problem Being Solved

Without a "question ready" gate, players can buzz in the moment a question square is clicked — before anyone has read or seen the question. In real Jeopardy this is prevented by the physical lockout mechanism on the buzzers, which the host controls manually. The buzzer literally does not work until the host releases it.

The two modes need different solutions because the nature of "question presentation" differs between them.

#### User Hosted Mode: Manual Host Toggle

This is straightforward and mirrors the real show exactly. The host has a button or toggle that releases the buzzers. Until they press it, buzz attempts are rejected server-side regardless of what the client does.

#### Computer Hosted Mode: The More Interesting Problem

There is no human host to press a button, so the system needs to determine when the question has been fully presented automatically. The right approach depends on what the question contains.

##### The Three Content Types Have Different Solutions

Text questions are the simplest case but also the most subjective. You cannot know how fast a player reads. The realistic options are:

**Option A — Fixed delay after reveal.** A countdown (e.g. 3–5 seconds) during which buzzers are locked. Simple, predictable, but one-size-fits-all. A very short question gets the same delay as a long one.

**Option B — Reading time estimation.** Calculate an approximate reading time from the word count and apply that as the delay. Research on average reading speed suggests about 200–250 words per minute for adults, meaning roughly 240ms per word. A 10-word question gets ~2.5 seconds, a 20-word question gets ~5 seconds.

**Option C — Player readiness acknowledgment.** Each player has a "ready" button. The buzzers open when all players have clicked ready, or after a maximum wait time (e.g. 15 seconds), whichever comes first. This is the fairest option but adds friction.

**Image questions** have a natural minimum viewing time but no defined endpoint. A reasonable approach is a fixed minimum (e.g. 5 seconds) combined with the player readiness option — the image stays visible, players press ready when they've seen enough.

**Video questions** have a known duration. The correct answer is to lock the buzzers until the video finishes playing. The client knows when the video ends via the HTML5 ended event, and signals the server.

#### Recommended Approach: Content-Aware Lockout

Rather than one strategy for all content types, use the most appropriate one per question.

#### Summary of Approach by Content Type

| Content              | Mode            | Lock strategy     | Opens when                  |
| -------------------- | --------------- | ----------------- | --------------------------- |
| Any                  | User hosted     | `host_controlled` | Host presses release button |
| Text (short)         | Computer hosted | `reading_time`    | Fixed delay (~2–3s)         |
| Text (long)          | Computer hosted | `reading_time`    | Fixed delay (~5–8s)         |
| Image                | Computer hosted | `awaiting_ready`  | All ready OR 30s maximum    |
| Video                | Computer hosted | `video_playing`   | Video ended event fires     |
| Mixed (text + image) | Computer hosted | `awaiting_ready`  | All ready OR 30s maximum    |
| Mixed (any + video)  | Computer hosted | `video_playing`   | Video ended event fires     |

The priority order for mixed content is video > image > text — if a question has any video, that governs the lockout because the video sets a natural completion point. If it has an image but no video, readiness acknowledgment applies. Text-only gets the estimated reading time.

This mirrors how the real show works: the host finishes presenting before the lockout releases, and the system adapts to what "finished presenting" means for each content type.

---

### VI. Screen Layouts for mobile devices

#### The Fundamental Problem

A standard Jeopardy board is a 6×6 grid (6 categories, 5 question rows, plus the category header row). On a desktop at 1280px wide, each cell is roughly 200px wide — readable and tappable. On a 390px wide iPhone screen, that same cell is 65px wide. Category names get truncated, point values become tiny, and tap targets fall below the recommended 44×44px minimum.
This isn't a problem you can solve with CSS alone. It requires rethinking the information architecture for small screens.

#### Screen Real Estate Constraints

Beyond the board itself, your game UI has several competing elements:

- The game board (primary)
- The player gallery (scores, avatars, active player indicator)
- The current question display (when a question is open)
- The answer input or buzz button
- The timer
- Audio/video controls
- Host controls (if applicable)

On desktop these coexist comfortably. On a 390×844px phone screen you cannot show all of them simultaneously at a useful size. You need a layered UI that shows different things at different moments.

#### Orientation Matters Enormously

**Landscape orientation** is significantly better for the board. A 6-column grid maps naturally to a wide viewport. Most tablet users will naturally hold in landscape for a game. You should strongly consider:

- Recommending landscape orientation via an on-screen prompt when a player joins on mobile
- Using the Screen Orientation API to detect portrait and suggest rotation
- Designing the board layout primarily for landscape, with portrait as a degraded but functional fallback

#### One approach: Adaptive Layout Based on Viewport

Use the full board on desktop and tablets in landscape, switch to a compressed or alternative layout on small portrait screens. This is the most work but the best result.

In the compact layout, consider:

- Abbreviating or hiding category names until a column header is tapped (reveals full name in a tooltip or modal)
- Showing only point values in cells (no other text)
- Using a smaller player gallery (just score badges rather than avatar squares)
- Moving the player gallery to a collapsible bottom drawer

#### Role-Based Layouts

This is worth considering seriously given your two play modes. The host needs a different interface than a player, and a spectator (someone watching but not playing) needs something different still.

On mobile specifically:

**Host on mobile** — needs large, easily tappable controls. The board overview is less critical than the control panel. Consider a host-specific layout that prioritizes the control surface over the board visualization.

**Player on mobile** — during active play, the most important elements are the buzz button and the current question. The full board is only needed when selecting the next question. A player's mobile UI could show:

- Board selection mode: full (compressed) board, player gallery minimized
- Question active mode: current question fills the screen, buzz button prominent, board hidden
- Answering mode: answer input fills the screen

This mode-switching approach maps well to your existing round state machine — each `RoundState` value can drive a different layout mode on the client.

#### Touch Target Considerations

Apple's Human Interface Guidelines recommend a minimum touch target of 44×44 points. Google's Material Design recommends 48×48dp. These are the targets your board cells need to meet.
On a 390px wide screen with 6 columns and gutters, a cell is roughly 60px wide — borderline acceptable but tight. With any border or padding, the actual tappable content area shrinks further.

Practical mitigations:

**Increase the touch target beyond the visual boundary** using CSS padding or the `touch-action` property, making the tappable area larger than what's visible.

**Use pointer events carefully** — cells that are already answered should not be tappable, which reduces the risk of accidental taps on neighboring cells.

**Provide visual feedback on tap** — a brief highlight or scale animation confirms the tap registered, reducing double-tap attempts that accidentally trigger adjacent cells.

#### The Buzz Button

The buzz button is the single most important interactive element during active play. On mobile it needs to be:

- Very large (ideally 80–120px diameter or larger)
- Centered and reachable with a thumb in both portrait and landscape
- Visually distinct when locked vs. active
- Responding to `touchstart` rather than `click` to shave off the 300ms delay browsers historically added to touch events

#### Player Gallery on Mobile

The avatar squares with video feeds are expensive on mobile — both in screen real estate and in battery/bandwidth terms. Considerations:

**Reduce gallery height in landscape.** In landscape on a phone the screen height is only ~390px. A gallery row of avatar squares at 80px height plus a name label consumes 20%+ of the vertical space. Consider making the gallery collapsible or reducing avatar size to 48–56px in landscape.

**Camera feeds are optional and expensive.** On mobile, camera and video decoding is battery-intensive. Players should be able to opt into camera-off mode easily, and the default for mobile connections should arguably be camera-off. Detecting mobile via the navigator.userAgent or viewport size and defaulting to initial avatar mode on mobile is a reasonable choice.

**Connection quality awareness.** Mobile connections vary wildly. WebRTC video quality degrades gracefully under poor conditions, but you might want to monitor connection stats and automatically switch players from camera to initial mode if their connection quality falls below a threshold.

#### Viewport and Safe Area Handling

Modern phones have notches, dynamic islands, and home indicator bars that encroach on usable screen space. CSS environment variables like `env(safe-area-inset-top)` handle this.

#### Progressive Web App Considerations

Since the game already requires a persistent connection and works best full-screen, making it installable as a PWA is worth considering:

- Full-screen mode eliminates browser chrome (address bar, navigation) — more screen for the board
- The installed icon on the home screen gives the app a more native feel
- Service workers can cache the Angular app shell for faster subsequent loads

This is an Angular-native capability via `ng add @angular/pwa` and doesn't require significant additional work.

#### Summary of Recommendations

| Concern                   | Recommendation                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------- |
| Board layout              | Adaptive: full grid on wide screens, column navigator or scrollable on small portrait |
| Orientation               | Prompt landscape on mobile, design primarily for landscape                            |
| Touch targets             | Minimum 44px, use CSS padding to extend beyond visual boundary                        |
| Buzz button               | Large, centered, `touchstart` not `click`, `touch-action: manipulation`               |
| Player gallery            | Collapsible or minimized in landscape, reduced avatar size                            |
| Camera feeds              | Default off on mobile, monitor connection quality                                     |
| Safe areas                | `env(safe-area-inset-*)` for notched devices                                          |
| Role-based UI             | Host and player have different layout priorities                                      |
| Round state drives layout | Each game state shows a different UI layer — board, question, answer input            |
| PWA                       | Consider for full-screen mode and home screen install                                 |

The most impactful single decision is the round-state-driven layout switching — showing the right interface for what the player needs to do right now rather than trying to fit everything on screen simultaneously. The board doesn't need to be visible when a player is reading a question and preparing to buzz. The player gallery doesn't need to be prominent when someone is typing an answer. Each state has a primary task, and the UI should reflect that.
