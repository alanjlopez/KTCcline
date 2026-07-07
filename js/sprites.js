// sprites.js — palette + procedural pixel-art. Every character and prop is drawn
// from small rectangles so the game ships with zero image assets. All draw
// functions assume the entity's *feet* sit at the current transform origin
// (0,0) and build upward in -y.
window.KTC = window.KTC || {};

(function (KTC) {
  'use strict';

  // Muted, dusty western palette pulled to match the reference screenshot.
  const PAL = {
    // ground
    dirt: ['#3c372f', '#453f35', '#4f473b', '#39342c'],
    grass: ['#4a4e3c', '#525640', '#454a38', '#3e4234'],
    road: ['#443d35', '#4b433a', '#3d372f'],
    // wood / props
    woodDark: '#3a3025',
    wood: '#5a4c3c',
    woodLight: '#6d5c47',
    stone: '#565049',
    stoneDark: '#3f3a34',
    metal: '#33343a',
    metalLight: '#5a5c64',
    // crow bandits
    crowShirt: '#7c2f2c',
    crowShirtDark: '#5c2321',
    crowPants: '#2b3350',
    crowPantsDark: '#20263c',
    crowMask: '#b7b9ab',
    crowBrute: '#4a2b3a',
    // gunslinger (player)
    pShirt: '#cdbb9c',
    pShirtDark: '#a99a7e',
    pVest: '#6c5334',
    pHat: '#403223',
    pSkin: '#bd8f64',
    pPants: '#4d4335',
    // fx
    blood: '#6f2020',
    bloodDark: '#521818',
    gold: '#c9a24a',
    goldLight: '#e3c06a',
    gem: '#5aa0a6',
    shadow: 'rgba(0,0,0,0.22)',
    steel: '#8a8d94',
  };

  function px(ctx, x, y, w, h, c) {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, w, h);
  }

  function shadow(ctx, r, flat) {
    ctx.fillStyle = PAL.shadow;
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * (flat || 0.3), 0, 0, KTC.Util.TAU);
    ctx.fill();
  }

  // Draw an arm + weapon rotating from a shoulder pivot toward `aim`.
  function drawArmGun(ctx, aim, gun, skin, sleeve) {
    const flip = Math.cos(aim) < 0 ? -1 : 1;
    ctx.save();
    ctx.translate(0, -11);
    ctx.rotate(aim);
    // arm
    px(ctx, 0, -1.5, 7, 3, sleeve);
    px(ctx, 6, -1, 3, 2, skin);
    // weapon body
    if (gun === 'shotgun') {
      px(ctx, 7, -1.5, 11, 3, PAL.metal);
      px(ctx, 7, -1.5, 4, 3, PAL.woodDark);
    } else if (gun === 'sniper') {
      // extra-long barrel + scope for the marksman crow
      px(ctx, 7, -1, 20, 2, PAL.metal);
      px(ctx, 7, -1, 5, 2, PAL.woodDark);
      px(ctx, 12, -3, 4, 2, PAL.metalLight);
    } else if (gun === 'rifle') {
      px(ctx, 7, -1, 15, 2, PAL.metal);
      px(ctx, 7, -1, 5, 2, PAL.woodDark);
    } else if (gun === 'repeater') {
      px(ctx, 7, -1.5, 12, 3, PAL.metal);
      px(ctx, 9, 1, 6, 2, PAL.metalLight);
    } else {
      // revolver
      px(ctx, 7, -1.5, 8, 3, PAL.metal);
      px(ctx, 8, -3, 3, 2, PAL.metalLight); // hammer/cylinder hint
      px(ctx, 8, 1.5, 2, 3, PAL.woodDark);  // grip
    }
    ctx.restore();
    return flip;
  }

  // Generic humanoid used by both player and crows. `c` supplies colours.
  function figure(ctx, o, c) {
    const bob = Math.sin(o.walk || 0) * 1.2;
    const legSwing = Math.sin(o.walk || 0) * 2;
    shadow(ctx, 7);

    // legs
    px(ctx, -3, -6 + Math.max(0, legSwing) * 0.2, 2.6, 6 - Math.abs(legSwing) * 0.2, c.pants);
    px(ctx, 0.4, -6 + Math.max(0, -legSwing) * 0.2, 2.6, 6 - Math.abs(legSwing) * 0.2, c.pants);
    // boots
    px(ctx, -3.2, -1.5 + legSwing * 0.3, 3, 1.6, c.boots || PAL.woodDark);
    px(ctx, 0.2, -1.5 - legSwing * 0.3, 3, 1.6, c.boots || PAL.woodDark);

    // torso
    const ty = -13 + bob;
    px(ctx, -3.4, ty, 6.8, 7.6, c.shirt);
    px(ctx, -3.4, ty, 6.8, 2.2, c.shirtDark); // shoulder shade
    if (c.vest) {
      px(ctx, -1.4, ty + 0.5, 2.8, 6.8, c.vest);
    }

    // back arm (static)
    px(ctx, -4.2, ty + 1, 2, 5, c.shirtDark);

    // head + face
    const hy = -19 + bob;
    px(ctx, -3, hy, 6, 6, c.skin);
    if (c.mask) {
      // bandit mask covering lower face
      px(ctx, -3, hy + 2.5, 6, 3.5, c.mask);
      px(ctx, -3, hy + 1.5, 6, 1, c.maskShade || PAL.crowMask);
    } else {
      // eyes shadow under hat brim
      px(ctx, -2, hy + 2, 4, 1, '#2a1f16');
    }

    // hat
    if (c.hat) {
      px(ctx, -5, hy + 0.5, 10, 1.6, c.hat);     // brim
      px(ctx, -3, hy - 2.5, 6, 3, c.hat);         // crown
      px(ctx, -3, hy - 0.6, 6, 0.8, c.hatBand || PAL.woodDark);
    }

    // front arm + gun
    if (o.gun !== undefined) {
      drawArmGun(ctx, o.aim || 0, o.gun, c.skin, c.shirt);
    } else if (o.knife) {
      // melee crow raises a blade toward the player
      const a = o.aim || 0;
      ctx.save();
      ctx.translate(0, -11);
      ctx.rotate(a - 0.5 + (o.swing || 0));
      px(ctx, 0, -1.5, 6, 3, c.shirt);
      px(ctx, 6, -1, 7, 2, PAL.steel);          // blade
      px(ctx, 5, -1.4, 2, 2.8, PAL.woodDark);   // handle
      ctx.restore();
    }
  }

  const Sprites = {
    PAL,
    px,
    shadow,

    player(ctx, o) {
      figure(ctx, o, {
        pants: PAL.pPants, shirt: PAL.pShirt, shirtDark: PAL.pShirtDark,
        vest: PAL.pVest, skin: PAL.pSkin, hat: PAL.pHat, hatBand: PAL.woodDark,
        boots: PAL.woodDark,
      });
    },

    crow(ctx, o) {
      if (o.type === 'brute') {
        ctx.save();
        ctx.scale(1.25, 1.25);
        figure(ctx, o, {
          pants: PAL.crowPantsDark, shirt: PAL.crowBrute, shirtDark: '#361f2a',
          skin: '#9a8f86', mask: PAL.crowMask, boots: PAL.stoneDark,
        });
        ctx.restore();
      } else if (o.type === 'gunman') {
        figure(ctx, o, {
          pants: PAL.crowPants, shirt: '#3f4a5e', shirtDark: '#2e3648',
          skin: '#a89a90', mask: PAL.crowMask, hat: '#2b2b30',
        });
      } else if (o.type === 'sniper') {
        // long dark duster + wide hat, unmistakable at a distance
        figure(ctx, o, {
          pants: '#23262e', shirt: '#2e2a33', shirtDark: '#211e26',
          vest: '#3c3644', skin: '#a89a90', mask: PAL.crowMask,
          hat: '#1d1c22', hatBand: '#7c2f2c',
        });
      } else {
        figure(ctx, o, {
          pants: PAL.crowPants, shirt: PAL.crowShirt, shirtDark: PAL.crowShirtDark,
          skin: '#a89a90', mask: PAL.crowMask,
        });
      }
    },

    // ---- small ground debris (drawn onto the static background) ----
    tuft(ctx, x, y, c) {
      px(ctx, x, y, 1, 3, c); px(ctx, x + 1, y - 1, 1, 4, c);
      px(ctx, x + 2, y, 1, 3, c); px(ctx, x - 1, y + 1, 1, 2, c);
    },
    plank(ctx, x, y, len, ang) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
      px(ctx, 0, 0, len, 3, PAL.woodDark);
      px(ctx, 0, 0, len, 1, PAL.wood);
      ctx.restore();
    },
    rock(ctx, x, y, s) {
      px(ctx, x, y, s, s * 0.7, PAL.stoneDark);
      px(ctx, x, y, s, 1, PAL.stone);
    },

    // ---- tall props (y-sorted with entities) ----
    well(ctx) {
      shadow(ctx, 16);
      px(ctx, -14, -14, 28, 16, PAL.stoneDark);
      px(ctx, -14, -14, 28, 4, PAL.stone);
      px(ctx, -11, -12, 22, 10, '#211d18'); // dark opening
      // posts + roof
      px(ctx, -12, -30, 3, 18, PAL.woodDark);
      px(ctx, 9, -30, 3, 18, PAL.woodDark);
      px(ctx, -16, -34, 32, 5, PAL.wood);
      px(ctx, -14, -30, 28, 2, PAL.woodDark);
    },
    building(ctx, w, h, tint) {
      shadow(ctx, w * 0.44, 0.16);
      const wall = tint || PAL.wood;
      px(ctx, -w / 2, -h, w, h, wall);
      // plank shading
      for (let i = 0; i < w; i += 6) px(ctx, -w / 2 + i, -h, 1, h, PAL.woodDark);
      px(ctx, -w / 2, -h, w, 3, PAL.woodLight); // top edge light
      // roof
      px(ctx, -w / 2 - 3, -h - 6, w + 6, 7, PAL.woodDark);
      // door + window
      px(ctx, -4, -14, 8, 14, '#20190f');
      px(ctx, w / 2 - 12, -h + 8, 7, 6, '#2b2418');
    },
    wagon(ctx) {
      shadow(ctx, 18);
      px(ctx, -18, -14, 34, 12, PAL.woodDark);
      px(ctx, -18, -14, 34, 3, PAL.wood);
      for (let i = -16; i < 16; i += 5) px(ctx, i, -13, 1, 10, PAL.wood);
      // wheels
      ctx.fillStyle = PAL.stoneDark;
      ctx.beginPath(); ctx.arc(-11, -2, 5, 0, KTC.Util.TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(11, -2, 5, 0, KTC.Util.TAU); ctx.fill();
      px(ctx, -12, -3, 2, 2, PAL.metalLight); px(ctx, 10, -3, 2, 2, PAL.metalLight);
    },
    log(ctx, len) {
      shadow(ctx, len * 0.5, 0.14);
      px(ctx, -len / 2, -8, len, 8, '#5b3f2c');
      px(ctx, -len / 2, -8, len, 2, '#6f4d36');
      px(ctx, len / 2 - 4, -8, 4, 8, '#3a281c'); // cut end
    },
    fence(ctx, len) {
      for (let i = 0; i <= len; i += 8) {
        px(ctx, i - len / 2, -12, 2, 12, PAL.woodDark);
      }
      px(ctx, -len / 2, -9, len, 2, PAL.wood);
      px(ctx, -len / 2, -4, len, 2, PAL.wood);
    },
    pole(ctx) {
      shadow(ctx, 4);
      px(ctx, -1.5, -46, 3, 46, PAL.woodDark);
      px(ctx, -8, -42, 16, 2, PAL.wood);
      px(ctx, -6, -38, 12, 2, PAL.wood);
    },
    crate(ctx, hurt) {
      shadow(ctx, 8);
      px(ctx, -7, -13, 14, 13, hurt ? '#7a6a4e' : PAL.wood);
      px(ctx, -7, -13, 14, 2, PAL.woodLight);
      px(ctx, -7, -13, 2, 13, PAL.woodDark);
      px(ctx, 5, -13, 2, 13, PAL.woodDark);
      px(ctx, -7, -8, 14, 1, PAL.woodDark);
    },
    barrel(ctx) {
      shadow(ctx, 7);
      px(ctx, -6, -15, 12, 15, '#4a3a28');
      px(ctx, -6, -15, 12, 2, '#5f4a33');
      px(ctx, -6, -11, 12, 1.5, PAL.metal);
      px(ctx, -6, -5, 12, 1.5, PAL.metal);
    },
    // ornate strongbox holding a trinket — glints purple to stand out
    cache(ctx, opened) {
      shadow(ctx, 10);
      px(ctx, -9, -12, 18, 12, '#3a2d3f');
      px(ctx, -9, -12, 18, 3, '#5a4568');
      px(ctx, -9, -8, 18, 1.5, '#c9a24a');   // gold band
      if (!opened) {
        px(ctx, -11, -16, 22, 5, '#4a3a56');  // domed lid
        px(ctx, -1.5, -10, 3, 4, '#c9a24a');  // lock
        ctx.save();
        ctx.globalAlpha = 0.4 + 0.25 * Math.sin(performance.now() / 260);
        ctx.fillStyle = '#b98bff';
        ctx.beginPath(); ctx.ellipse(0, -8, 16, 12, 0, 0, KTC.Util.TAU); ctx.fill();
        ctx.restore();
      } else {
        px(ctx, -11, -18, 22, 4, '#4a3a56');  // lid flipped open
        px(ctx, -8, -11, 16, 3, '#17120f');
      }
    },
    // a rack with a spare iron on it
    weaponrack(ctx, opened) {
      shadow(ctx, 10);
      px(ctx, -10, -3, 20, 3, PAL.woodDark);
      px(ctx, -9, -16, 2, 14, PAL.woodDark);
      px(ctx, 7, -16, 2, 14, PAL.woodDark);
      if (!opened) {
        px(ctx, -9, -14, 18, 3, PAL.metal);
        px(ctx, -9, -14, 6, 3, PAL.woodDark);
        ctx.save();
        ctx.globalAlpha = 0.3 + 0.2 * Math.sin(performance.now() / 300);
        ctx.fillStyle = '#8ecfd4';
        ctx.beginPath(); ctx.ellipse(0, -12, 15, 10, 0, 0, KTC.Util.TAU); ctx.fill();
        ctx.restore();
      }
    },
    // ---- base hub props ----
    tent(ctx, tint) {
      shadow(ctx, 16, 0.18);
      ctx.fillStyle = tint || '#6a5238';
      ctx.beginPath();
      ctx.moveTo(0, -26); ctx.lineTo(-16, -2); ctx.lineTo(16, -2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.moveTo(0, -26); ctx.lineTo(4, -2); ctx.lineTo(16, -2); ctx.closePath(); ctx.fill();
      px(ctx, -4, -14, 8, 12, '#1c150d');           // entrance flap
      px(ctx, -1, -27, 2, 4, PAL.woodDark);         // pole tip
    },
    campfire(ctx) {
      shadow(ctx, 10, 0.2);
      for (let i = 0; i < 5; i++) {
        const a = i * (KTC.Util.TAU / 5);
        px(ctx, Math.cos(a) * 7 - 1, Math.sin(a) * 4 - 1, 4, 2, PAL.woodDark);
      }
      const t = performance.now() / 120;
      ctx.fillStyle = '#e08a3a';
      ctx.beginPath(); ctx.moveTo(-4, -2); ctx.lineTo(0, -12 - Math.sin(t) * 3); ctx.lineTo(4, -2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#f0c060';
      ctx.beginPath(); ctx.moveTo(-2, -2); ctx.lineTo(0, -8 - Math.sin(t * 1.3) * 2); ctx.lineTo(2, -2); ctx.closePath(); ctx.fill();
    },
    gate(ctx) {
      shadow(ctx, 20, 0.14);
      px(ctx, -22, -30, 5, 30, PAL.woodDark);
      px(ctx, 17, -30, 5, 30, PAL.woodDark);
      px(ctx, -24, -34, 48, 6, PAL.wood);
      px(ctx, -24, -34, 48, 2, PAL.woodLight);
      // hanging sign
      px(ctx, -10, -28, 20, 8, '#3a2d1e');
      ctx.fillStyle = '#c9a24a'; ctx.font = '5px "Courier New", monospace'; ctx.textAlign = 'center';
      ctx.fillText('THE FIELD', 0, -22); ctx.textAlign = 'left';
    },
    // benches — deploy map table, workbench, gunsmith
    bench(ctx, type) {
      shadow(ctx, 15, 0.18);
      px(ctx, -14, -13, 28, 11, PAL.wood);          // tabletop
      px(ctx, -14, -13, 28, 2, PAL.woodLight);
      px(ctx, -13, -2, 3, 4, PAL.woodDark);         // legs
      px(ctx, 10, -2, 3, 4, PAL.woodDark);
      if (type === 'deploy') {
        px(ctx, -10, -20, 20, 9, '#cabf9a');        // spread map
        ctx.fillStyle = '#7a2f2c';
        for (let i = 0; i < 4; i++) px(ctx, -8 + i * 5, -18 + (i % 2) * 4, 2, 2, '#7a2f2c');
        px(ctx, 6, -22, 1, 4, PAL.metalLight);      // pins
      } else if (type === 'workbench') {
        px(ctx, -12, -19, 10, 6, PAL.metal);        // anvil
        px(ctx, -13, -13, 12, 2, PAL.metalLight);
        px(ctx, 4, -18, 2, 5, PAL.woodDark);        // hammer
        px(ctx, 3, -19, 5, 2, PAL.metalLight);
        px(ctx, 8, -17, 3, 4, '#9a6fd0');           // a relic
      } else { // gunsmith
        px(ctx, -12, -17, 14, 2, PAL.metal);        // rifle on rack
        px(ctx, -12, -17, 4, 2, PAL.woodDark);
        px(ctx, 2, -20, 8, 3, PAL.metal);           // pistol
        px(ctx, 6, -17, 2, 2, PAL.woodDark);
        px(ctx, -10, -13, 3, 3, '#c9a24a');         // brass
      }
    },

    // extraction point: a waiting stagecoach
    stagecoach(ctx, glow) {
      shadow(ctx, 24);
      // cabin
      px(ctx, -18, -22, 26, 20, '#3a2c1e');
      px(ctx, -18, -22, 26, 3, '#54402a');
      px(ctx, -14, -19, 10, 8, '#191009'); // window
      px(ctx, -3, -19, 8, 8, '#191009');
      // roof + rails
      px(ctx, -20, -26, 30, 5, PAL.woodDark);
      // driver bench
      px(ctx, 6, -16, 10, 6, '#4a3722');
      // wheels
      ctx.fillStyle = '#241a12';
      ctx.beginPath(); ctx.arc(-12, -1, 7, 0, KTC.Util.TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(6, -1, 5, 0, KTC.Util.TAU); ctx.fill();
      // horse hint
      px(ctx, 16, -14, 12, 8, '#3b3129');
      px(ctx, 26, -16, 4, 5, '#3b3129');
      if (glow > 0) {
        ctx.save();
        ctx.globalAlpha = 0.25 + 0.15 * Math.sin(glow * 6);
        ctx.fillStyle = '#e3c06a';
        ctx.beginPath(); ctx.ellipse(-6, -12, 30, 22, 0, 0, KTC.Util.TAU); ctx.fill();
        ctx.restore();
      }
    },
  };

  KTC.Sprites = Sprites;
})(window.KTC);
