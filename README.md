# Havoc City — C++ Open-World Crime Game

Havoc City is now a native C++20 third-person open-world game inspired by the systemic mission design and urban sandbox feel of classic early-2000s crime games. It is an original project and does not use proprietary names, code, models, audio, or assets.

## Architecture

- **Deterministic simulation:** fixed 60 Hz physics, AABB collision bodies, gravity, ray casts, vehicle response, and frame-rate-independent movement.
- **Living city:** 42 simulated NPCs use state machines for wandering, conversations, investigation, fleeing, combat, injury, and death. Police respond dynamically to witnessed crimes and escalating heat.
- **Combat:** fists, bat, pistol, SMG, shotgun, rifle, and rocket launcher have distinct damage, range, magazines, reloads, cooldowns, and explosive behavior.
- **Mission pipeline:** queued multi-stage missions support reach, talk, enter-vehicle, eliminate, damage, escape-heat, and timed objectives.
- **Cinematics:** an interruptible keyframe director interpolates camera position, target, field of view, and completion callbacks.
- **Atmosphere and audio:** time-of-day, rain/storm wetness, wind, lightning, positional cue events, engines, weapons, impacts, sirens, dialogue, and mission stingers.
- **Native renderer:** the optional Raylib client renders the 3D world and consumes the engine's simulation and audio event queues. Core gameplay has no rendering dependency and is unit-testable.

## Build the simulation and tests

```bash
cmake -S . -B build -DHAVOC_BUILD_GAME=OFF -DHAVOC_BUILD_TESTS=ON
cmake --build build -j
ctest --test-dir build --output-on-failure
```

## Build the 3D game

The first configure downloads Raylib 5.5 from its official repository:

```bash
cmake -S . -B build -DHAVOC_BUILD_GAME=ON
cmake --build build -j
./build/havoc_city
```

## Controls

| Input | Action |
|---|---|
| WASD | Camera-relative movement / drive |
| Mouse | Aim and orbit camera |
| Left mouse | Fire selected weapon |
| Space | Jump |
| E | Talk / enter vehicle |
| R | Reload |
| Shift | Sprint |
| 1–7 | Select weapon |
| Escape | Skip cutscene / pause |
