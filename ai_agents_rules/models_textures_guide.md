# AI Guide: 2D Rigged Sprites, Textures, and Hitboxes for MegaZoida

This guide is for AI agents creating detailed 2D sprite-style characters (rigged + animated) that live inside a 3D Three.js scene. The project uses FBX models with a simple Walk animation and billboarding is not required, so the sprites are built as flat planes with bones.

## Core Targets
- Style: Megabonk-like 2D sprites, but rigged as flat planes in 3D.
- Export: FBX with baked animation (Walk).
- Orientation: The character plane stands upright, facing +Z by default.
- Animation: Walk loop, 30 frames, keyframes at 1, 15, 30.
- Scale: Keep head-to-feet around 2.0 units in Blender; final size is adjusted in Three.js by scaling and hitbox radius.
- Hitbox: Use a sphere/circle around the feet. Match `radius` to about half the character width.

## Visual Detail Rules
- Use multiple planes for parts: head, torso, arms, legs, plus accessories.
- Accessories add readability: helmet, hood, shield, bow, quiver, cape, etc.
- Keep colors high-contrast so silhouettes read well on a top-down map.
- Keep alpha (transparent backgrounds) and set materials to double-sided.
- Avoid tiny thin details that collapse at mobile resolution.

## Texture Workflow (Simple + Reliable)
If using textures instead of flat colors:
1. Make a single PNG per character (power-of-two: 256 or 512). Transparent background.
2. Use consistent UVs for each plane so textures map cleanly.
3. Keep palette limited: 5-8 colors for readability.
4. In Three.js, use `alphaTest = 0.5` and `DoubleSide` on the material.

## Rig + Animation Checklist
- Armature bones: Root, Head, Arm_L, Arm_R, Leg_L, Leg_R.
- Parent all bones to Root.
- Apply automatic weights; verify limbs move cleanly.
- Walk animation:
  - Frame 1: left leg forward, right leg back; arms opposite.
  - Frame 15: swap legs and arms.
  - Frame 30: return to frame 1.
- Bake animation into FBX on export.

## Export Requirements
- File names:
  - `public/assets/models/Hero_Human2D.fbx`
  - `public/assets/models/Hero_Knight2D.fbx`
  - `public/assets/models/Hero_Archer2D.fbx`
  - `public/assets/models/Enemy_Skeleton2D.fbx`
- FBX export:
  - `bake_anim = true`
  - `add_leaf_bones = false`
  - No extra cameras or lights

## Hitbox Alignment Rules
- Hitbox uses `radius` in `Player.ts` and `Enemy.ts`.
- Keep the mesh origin at character center; feet should be at `y = 0` in Blender.
- Adjust `radius` by hero type:
  - Knight: 22
  - Human: 19
  - Archer: 18
  - Skeleton: 15 (boss scales up in code)

## Automated Generation
This repo includes `generate_models.py`, which builds flat-plane rigs with a walk animation and exports FBX files to the correct paths. If Blender MCP is running, you can execute that script content via the MCP Blender tools.

## Quick Validation Steps
1. Load the FBX in Three.js and verify:
   - Animation plays.
   - Material is double-sided with alpha.
   - Model sits on the terrain (feet near ground).
2. Test in-game:
   - Walk cycle plays only when moving.
   - Hitbox collisions feel fair.
   - Character is readable on the arena map.
