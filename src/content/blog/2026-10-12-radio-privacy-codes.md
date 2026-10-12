---
title: Your radio's 'privacy code' isn't private
description: The tone marketed as a "privacy code" on an FRS or GMRS radio only decides what your own speaker plays — anyone else on the channel still hears you, which is why monitoring with it off matters when it counts.
pubDate: 2026-10-12
tag: Explainer
author: Signal Desk
---

In the Highway 4 and Highway 49 corridors, a pair of handheld radios is a common fallback for the days when the cell bars and the power go at once — a two-way set from the hardware store, no tower in the path. Most of them carry a setting labeled a "privacy code," and the name has misled a lot of people about what it does.

## What the radios are

Those bubble-pack radios run on the Family Radio Service (FRS) and the General Mobile Radio Service (GMRS). FRS is, in the FCC's words, ["an unlicensed service for use by families and groups"](https://transition.fcc.gov/pshs/docs/clearinghouse/references/cert-radio-fundamentalsIG-pt1.doc); GMRS covers more powerful radios "which provide greater range" under a [10-year license](https://www.fcc.gov/general-mobile-radio-service-gmrs). The two share channels — "GMRS and FRS users can legally talk to each other," the same guide notes — so a lot of households, neighbors, and passing travelers are all drawing on the same handful of frequencies.

## What the code actually is

The "privacy code" is a squelch tone. Formally it is CTCSS — continuous tone-coded squelch — a low [sub-audible tone in the 67 to 254.1 Hz range](https://en.wikipedia.org/wiki/Continuous_Tone-Coded_Squelch_System) that the radio adds underneath your voice, below what the speaker plays. A receiver set to the same tone "unmutes only when the signal also carries the correct sub-audible audio tone." Some radios use a digital version, DCS, that works the same way. Set two radios to channel 15, code 22, and they stay quiet to everything on channel 15 except each other.

## What it does not do

It does not make the channel private. An FCC radio-fundamentals guide for CERT teams [puts it flatly](https://transition.fcc.gov/pshs/docs/clearinghouse/references/cert-radio-fundamentalsIG-pt1.doc): "So-called 'privacy codes' do NOT make your conversation private." The tone decides what your radio plays, not what it sends. ["Receivers without CTCSS enabled will still hear all traffic"](https://en.wikipedia.org/wiki/Continuous_Tone-Coded_Squelch_System) — anyone on channel 15 with no tone set, or a scanner, hears every word.

And it creates nothing. "No additional radio channels are created." Two groups on channel 15 with different codes are on the identical frequency, so "their transmissions interfere with each other" — each side simply muted to the other's half of the collision. The tone saved you from hearing the interference; it did nothing to prevent it.

## Why it matters in this terrain

That last part is the one that bites here. On a busy fire-weather day the shared channels fill up, and a tone set on your radio means you do not hear the traffic you are talking over — or a call you would want to hear. The FCC guide's advice for anyone monitoring is blunt: ["use 'carrier squelch' only"](https://transition.fcc.gov/pshs/docs/clearinghouse/references/cert-radio-fundamentalsIG-pt1.doc) — turn the tone off — "so that you will hear EVERYONE who is using the channel. You don't want to miss some one's distress call because you had 'tone on' and they didn't."

So the setting has a real but narrow use. On an ordinary day, a shared tone keeps a family's handsets from chirping at every stranger on the channel, which is a convenience worth having. Treat it as exactly that. It is not privacy — assume anyone can hear you. It is not a clear channel — it will not stop you talking over someone, or them over you.

When it matters — a crowded air day, an emergency — turn the tone off, listen before you key up, and wait for the channel to clear. "The most important part of using a 2-way radio effectively is LISTENING, not talking." Hearing everyone on the frequency, including the people you might otherwise step on, is the whole point of carrying the radio.

_Curious about the network? Get in touch via the [contact page](/contact)._
