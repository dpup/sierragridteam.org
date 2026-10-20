---
title: What signed messages add to a LoRa mesh
description: Mesh firmware is starting to sign each message with a per-node key so a receiver can confirm who sent it — a different guarantee from the encryption that already hides the content.
pubDate: 2026-10-20
tag: Tech
author: Signal Desk
---

In a foothill power outage, a short text that arrives over a LoRa mesh — the network of low-power radios that pass messages hop to hop when there is no cell tower in the path — is easy to take at face value. It is worth asking a plainer question first: how does the receiving radio know the message is really from who it claims? Mesh firmware has started to answer it.

## What the shared key protects

A mesh channel is encrypted, but not in the way most people picture. Meshtastic, one of the common mesh platforms, [encrypts each message with a key shared by everyone on the channel](https://meshtastic.org/docs/overview/encryption) — one pre-shared key, AES-128 or AES-256, that every node on that channel holds. That hides the content from anyone without the key. It does nothing to prove who sent a given message. In the project's own words, ["anyone with a channel's key can send an unsigned packet that claims to come from any node"](https://meshtastic.org/docs/overview/encryption) — so a receiver should treat the named sender "as a claim, not a proof."

The gap is not hypothetical. A [documented vulnerability](https://github.com/meshtastic/firmware/security/advisories/GHSA-45vg-3f35-7ch2) in older Meshtastic firmware ran straight through it: because a node was identified by a number derived from its hardware MAC address rather than a cryptographic key, an attacker could forge the identifying record of another node and have the rest of the network accept it.

## Signing the sender

Meshtastic's [version 2.8](https://meshtastic.org/blog/lets-talk-about-2-8/), out this month, rebuilds identity around public-key cryptography. A node's number is now derived from its public key, and a node signs its broadcasts "with their identity key, so a receiver can confirm who sent them." A new setting controls how strict to be: the default, Compatible, still accepts unsigned packets from older nodes; Balanced requires a signature from any node that has signed before; Strict accepts only what it can verify.

It is early code, and the project says so. The first cut, 2.8.0, was pulled after release over a flaw in the signing itself; its replacement, 2.8.1, is labeled an alpha that "isn't ready for wide deployment." The direction is set; the release to run it on is not here yet.

## Not one project's problem

Authenticating a message is something every mesh platform is working through, not a finished feature anywhere. [MeshCore](https://docs.meshcore.io/faq/) — the platform this network is built on — already signs the advert each node broadcasts about itself, with the public key in it "also signed to prevent spoofing." But an ordinary group message is still marked, in its own packet notes, an "(unverified) group text message." Signing a node's identity and signing the content it sends are separate steps, and the second is the harder one.

For anyone running a node, the practical reading is short. Encryption and authentication are two different guarantees: one keeps outsiders from reading a message, the other lets a receiver trust where it came from, and a mesh can have the first without the second. Keep a node's firmware current so the identity and signing work applies as it lands — and when it does, set the signature policy with care, because Strict rejects a forged sender and a neighbor still on older firmware alike.
