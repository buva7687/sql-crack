import { themes, Theme } from '../webview/themes';

describe('Themes', () => {
  describe('Theme Structure', () => {
    it('should have all required themes', () => {
      expect(themes).toHaveProperty('dark');
      expect(themes).toHaveProperty('light');
      expect(themes).toHaveProperty('ocean');
      expect(themes).toHaveProperty('forest');
      expect(themes).toHaveProperty('sunset');
    });

    it('should have exactly 5 themes', () => {
      expect(Object.keys(themes).length).toBe(5);
    });

    it('should have unique theme names', () => {
      const names = Object.keys(themes);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });
  });

  describe('Dark Theme', () => {
    it('should have correct name', () => {
      expect(themes.dark.name).toBe('Dark');
    });

    it('should have all required color properties', () => {
      const theme = themes.dark;
      expect(theme.background).toBeDefined();
      expect(theme.panel).toBeDefined();
      expect(theme.node).toBeDefined();
      expect(theme.dotColor).toBeDefined();
    });

    it('should have dark background color', () => {
      expect(themes.dark.background).toBe('#1e1e1e');
    });

    it('should have panel color', () => {
      expect(themes.dark.panel).toBe('#2d2d2d');
    });

    it('should have node color', () => {
      expect(themes.dark.node).toBe('#667eea');
    });

    it('should have dot color', () => {
      expect(themes.dark.dotColor).toBe('#404040');
    });

    it('should have valid hex colors', () => {
      const theme = themes.dark;
      expect(theme.background).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(theme.panel).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(theme.node).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(theme.dotColor).toMatch(/^#[0-9a-fA-F]{6}$/);
    });
  });

  describe('Light Theme', () => {
    it('should have correct name', () => {
      expect(themes.light.name).toBe('Light');
    });

    it('should have all required color properties', () => {
      const theme = themes.light;
      expect(theme.background).toBeDefined();
      expect(theme.panel).toBeDefined();
      expect(theme.node).toBeDefined();
      expect(theme.dotColor).toBeDefined();
    });

    it('should have light background color', () => {
      expect(themes.light.background).toBe('#ffffff');
    });

    it('should have panel color', () => {
      expect(themes.light.panel).toBe('#f5f5f5');
    });

    it('should have node color', () => {
      expect(themes.light.node).toBe('#4f46e5');
    });

    it('should have dot color', () => {
      expect(themes.light.dotColor).toBe('#e0e0e0');
    });

    it('should be different from dark theme', () => {
      expect(themes.light.background).not.toBe(themes.dark.background);
      expect(themes.light.panel).not.toBe(themes.dark.panel);
    });
  });

  describe('Ocean Theme', () => {
    it('should have correct name', () => {
      expect(themes.ocean.name).toBe('Ocean');
    });

    it('should have all required color properties', () => {
      const theme = themes.ocean;
      expect(theme.background).toBeDefined();
      expect(theme.panel).toBeDefined();
      expect(theme.node).toBeDefined();
      expect(theme.dotColor).toBeDefined();
    });

    it('should have ocean-themed colors', () => {
      const theme = themes.ocean;
      // Ocean theme should have blue/teal colors
      expect(theme.background).toBe('#0f172a');
      expect(theme.panel).toBe('#1e293b');
      expect(theme.node).toBe('#06b6d4');
    });

    it('should have valid hex colors', () => {
      const theme = themes.ocean;
      expect(theme.background).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(theme.panel).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(theme.node).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(theme.dotColor).toMatch(/^#[0-9a-fA-F]{6}$/);
    });
  });

  describe('Forest Theme', () => {
    it('should have correct name', () => {
      expect(themes.forest.name).toBe('Forest');
    });

    it('should have all required color properties', () => {
      const theme = themes.forest;
      expect(theme.background).toBeDefined();
      expect(theme.panel).toBeDefined();
      expect(theme.node).toBeDefined();
      expect(theme.dotColor).toBeDefined();
    });

    it('should have forest-themed colors', () => {
      const theme = themes.forest;
      // Forest theme should have green colors
      expect(theme.background).toBe('#1a2e1a');
      expect(theme.panel).toBe('#2d4a2d');
      expect(theme.node).toBe('#48bb78');
    });

    it('should have valid hex colors', () => {
      const theme = themes.forest;
      expect(theme.background).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(theme.panel).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(theme.node).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(theme.dotColor).toMatch(/^#[0-9a-fA-F]{6}$/);
    });
  });

  describe('Sunset Theme', () => {
    it('should have correct name', () => {
      expect(themes.sunset.name).toBe('Sunset');
    });

    it('should have all required color properties', () => {
      const theme = themes.sunset;
      expect(theme.background).toBeDefined();
      expect(theme.panel).toBeDefined();
      expect(theme.node).toBeDefined();
      expect(theme.dotColor).toBeDefined();
    });

    it('should have sunset-themed colors', () => {
      const theme = themes.sunset;
      // Sunset theme should have pink/purple colors
      expect(theme.background).toBe('#2d1b2e');
      expect(theme.panel).toBe('#4a2d4a');
      expect(theme.node).toBe('#ed64a6');
    });

    it('should have valid hex colors', () => {
      const theme = themes.sunset;
      expect(theme.background).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(theme.panel).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(theme.node).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(theme.dotColor).toMatch(/^#[0-9a-fA-F]{6}$/);
    });
  });

  describe('Theme Uniqueness', () => {
    it('should have unique background colors', () => {
      const backgrounds = Object.values(themes).map(t => t.background);
      const uniqueBackgrounds = new Set(backgrounds);
      expect(uniqueBackgrounds.size).toBe(backgrounds.length);
    });

    it('should have unique panel colors', () => {
      const panels = Object.values(themes).map(t => t.panel);
      const uniquePanels = new Set(panels);
      expect(uniquePanels.size).toBe(panels.length);
    });

    it('should have unique node colors', () => {
      const nodes = Object.values(themes).map(t => t.node);
      const uniqueNodes = new Set(nodes);
      expect(uniqueNodes.size).toBe(nodes.length);
    });
  });

  describe('Theme Accessibility', () => {
    it('should have sufficient contrast between background and panel', () => {
      Object.values(themes).forEach(theme => {
        // Background and panel should be different colors
        expect(theme.background).not.toBe(theme.panel);
      });
    });

    it('should have visible node colors on backgrounds', () => {
      Object.values(themes).forEach(theme => {
        // Node color should be different from background
        expect(theme.node).not.toBe(theme.background);
      });
    });

    it('should have visible dot colors', () => {
      Object.values(themes).forEach(theme => {
        // Dot color should be different from background
        expect(theme.dotColor).not.toBe(theme.background);
      });
    });
  });

  describe('Theme Type Safety', () => {
    it('should match Theme interface', () => {
      Object.values(themes).forEach(theme => {
        expect(typeof theme.name).toBe('string');
        expect(typeof theme.background).toBe('string');
        expect(typeof theme.panel).toBe('string');
        expect(typeof theme.node).toBe('string');
        expect(typeof theme.dotColor).toBe('string');
      });
    });

    it('should have no extra properties', () => {
      Object.values(themes).forEach(theme => {
        const keys = Object.keys(theme);
        expect(keys).toEqual(['name', 'background', 'panel', 'node', 'dotColor']);
      });
    });
  });

  describe('Theme Color Consistency', () => {
    it('should use lowercase hex colors', () => {
      Object.values(themes).forEach(theme => {
        expect(theme.background).toBe(theme.background.toLowerCase());
        expect(theme.panel).toBe(theme.panel.toLowerCase());
        expect(theme.node).toBe(theme.node.toLowerCase());
        expect(theme.dotColor).toBe(theme.dotColor.toLowerCase());
      });
    });

    it('should use 6-digit hex colors (not 3-digit)', () => {
      Object.values(themes).forEach(theme => {
        expect(theme.background.length).toBe(7); // # + 6 digits
        expect(theme.panel.length).toBe(7);
        expect(theme.node.length).toBe(7);
        expect(theme.dotColor.length).toBe(7);
      });
    });
  });

  describe('Theme Names', () => {
    it('should have capitalized theme names', () => {
      Object.values(themes).forEach(theme => {
        expect(theme.name[0]).toBe(theme.name[0].toUpperCase());
      });
    });

    it('should have descriptive names', () => {
      const names = Object.values(themes).map(t => t.name);
      expect(names).toContain('Dark');
      expect(names).toContain('Light');
      expect(names).toContain('Ocean');
      expect(names).toContain('Forest');
      expect(names).toContain('Sunset');
    });

    it('should have unique display names', () => {
      const names = Object.values(themes).map(t => t.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });
  });

  describe('Theme Color Brightness', () => {
    it('dark theme should have darker colors than light theme', () => {
      // Convert hex to brightness value
      const getBrightness = (hex: string) => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return (r * 299 + g * 587 + b * 114) / 1000;
      };

      const darkBrightness = getBrightness(themes.dark.background);
      const lightBrightness = getBrightness(themes.light.background);

      expect(darkBrightness).toBeLessThan(lightBrightness);
    });
  });

  describe('Theme Export', () => {
    it('should export themes object', () => {
      expect(themes).toBeDefined();
      expect(typeof themes).toBe('object');
    });

    it('should be accessible by key', () => {
      expect(themes['dark']).toBeDefined();
      expect(themes['light']).toBeDefined();
      expect(themes['ocean']).toBeDefined();
      expect(themes['forest']).toBeDefined();
      expect(themes['sunset']).toBeDefined();
    });

    it('should be iterable', () => {
      const themeKeys = Object.keys(themes);
      expect(Array.isArray(themeKeys)).toBe(true);
      expect(themeKeys.length).toBe(5);
    });
  });
});
