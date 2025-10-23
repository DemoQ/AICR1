/**
 * Comprehensive validation tests for package-lock.json
 * 
 * These tests ensure the package-lock.json file maintains:
 * - Valid JSON syntax
 * - Required schema structure and fields
 * - Proper dependency format and relationships
 * - Integrity and security constraints
 * - Consistency with package.json
 */

const fs = require('fs');
const path = require('path');

describe('package-lock.json Validation', () => {
  let packageLockContent;
  let packageLockPath;
  let packageJsonContent;
  
  beforeAll(() => {
    packageLockPath = path.join(process.cwd(), 'package-lock.json');
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    
    // Read raw content for syntax validation
    packageLockContent = fs.readFileSync(packageLockPath, 'utf8');
    packageJsonContent = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  });

  describe('File Existence and Accessibility', () => {
    test('should exist in the project root', () => {
      expect(fs.existsSync(packageLockPath)).toBe(true);
    });

    test('should be readable', () => {
      expect(() => fs.readFileSync(packageLockPath, 'utf8')).not.toThrow();
    });

    test('should not be empty', () => {
      expect(packageLockContent.length).toBeGreaterThan(0);
    });

    test('should have reasonable file size (not corrupted)', () => {
      // Should be at least 1KB for a valid Next.js project
      expect(packageLockContent.length).toBeGreaterThan(1000);
    });
  });

  describe('JSON Syntax Validation', () => {
    test('should be valid JSON', () => {
      expect(() => JSON.parse(packageLockContent)).not.toThrow();
    });

    test('should not contain trailing commas', () => {
      // Check for common JSON errors like trailing commas
      const trailingCommaPattern = /,\s*[}\]]/g;
      const matches = packageLockContent.match(trailingCommaPattern);
      expect(matches).toBeNull();
    });

    test('should not contain duplicate commas', () => {
      // Check for the specific error introduced: multiple consecutive commas
      const duplicateCommaPattern = /,,+/g;
      const matches = packageLockContent.match(duplicateCommaPattern);
      if (matches) {
        fail(`Found duplicate commas at ${matches.length} location(s): ${matches.join(', ')}`);
      }
    });

    test('should not contain malformed property names', () => {
      // All property names should be properly quoted
      const malformedPropertyPattern = /[{,]\s*[^"\s]/g;
      const lines = packageLockContent.split('\n');
      const issues = [];
      
      lines.forEach((line, index) => {
        // Skip lines that are just values or empty
        if (line.trim().match(/^[}\]"]/) || line.trim() === '') return;
        
        // Check if line has a property that's not properly quoted
        if (line.includes(':') && !line.trim().match(/^"[^"]*":/)) {
          const trimmed = line.trim();
          // Exclude valid cases like array/object start
          if (!trimmed.match(/^[{\[]/) && trimmed !== '}' && trimmed !== ']') {
            issues.push(`Line ${index + 1}: ${line.trim()}`);
          }
        }
      });
      
      expect(issues).toHaveLength(0);
    });

    test('should have balanced brackets and braces', () => {
      const openBraces = (packageLockContent.match(/{/g) || []).length;
      const closeBraces = (packageLockContent.match(/}/g) || []).length;
      const openBrackets = (packageLockContent.match(/\[/g) || []).length;
      const closeBrackets = (packageLockContent.match(/]/g) || []).length;

      expect(openBraces).toBe(closeBraces);
      expect(openBrackets).toBe(closeBrackets);
    });

    test('should have properly quoted strings', () => {
      // Check that all string values are properly quoted
      const parsed = JSON.parse(packageLockContent);
      expect(parsed).toBeTruthy();
    });
  });

  describe('Schema Structure Validation', () => {
    let packageLock;

    beforeAll(() => {
      packageLock = JSON.parse(packageLockContent);
    });

    test('should have required top-level fields', () => {
      const requiredFields = ['name', 'version', 'lockfileVersion', 'requires', 'dependencies'];
      
      requiredFields.forEach(field => {
        expect(packageLock).toHaveProperty(field);
      });
    });

    test('should have a valid name field', () => {
      expect(typeof packageLock.name).toBe('string');
      expect(packageLock.name.length).toBeGreaterThan(0);
    });

    test('should have a valid version field', () => {
      expect(typeof packageLock.version).toBe('string');
      expect(packageLock.version).toMatch(/^\d+\.\d+\.\d+/);
    });

    test('should have a valid lockfileVersion', () => {
      expect(typeof packageLock.lockfileVersion).toBe('number');
      expect(packageLock.lockfileVersion).toBeGreaterThanOrEqual(1);
    });

    test('should have dependencies as an object', () => {
      expect(typeof packageLock.dependencies).toBe('object');
      expect(Array.isArray(packageLock.dependencies)).toBe(false);
    });

    test('should have at least one dependency', () => {
      const dependencyCount = Object.keys(packageLock.dependencies || {}).length;
      expect(dependencyCount).toBeGreaterThan(0);
    });

    test('name should match package.json', () => {
      expect(packageLock.name).toBe(packageJsonContent.name);
    });

    test('version should match package.json', () => {
      expect(packageLock.version).toBe(packageJsonContent.version);
    });
  });

  describe('Dependency Structure Validation', () => {
    let packageLock;
    let dependencies;

    beforeAll(() => {
      packageLock = JSON.parse(packageLockContent);
      dependencies = packageLock.dependencies || {};
    });

    test('each dependency should have required fields', () => {
      const dependencyNames = Object.keys(dependencies);
      expect(dependencyNames.length).toBeGreaterThan(0);

      dependencyNames.forEach(depName => {
        const dep = dependencies[depName];
        
        // Each dependency should be an object
        expect(typeof dep).toBe('object');
        
        // Each dependency should have a version
        expect(dep).toHaveProperty('version');
        expect(typeof dep.version).toBe('string');
      });
    });

    test('dependency versions should be valid semver', () => {
      const semverPattern = /^\d+\.\d+\.\d+/;
      
      Object.entries(dependencies).forEach(([name, dep]) => {
        expect(dep.version).toMatch(semverPattern);
      });
    });

    test('dependencies with "resolved" field should have valid URLs', () => {
      const urlPattern = /^https?:\/\/.+/;
      
      Object.entries(dependencies).forEach(([name, dep]) => {
        if (dep.resolved) {
          expect(typeof dep.resolved).toBe('string');
          expect(dep.resolved).toMatch(urlPattern);
        }
      });
    });

    test('dependencies with "integrity" field should have valid hashes', () => {
      // Integrity should be in format: sha1-xxx or sha512-xxx
      const integrityPattern = /^(sha1|sha256|sha512)-[A-Za-z0-9+/=]+$/;
      
      Object.entries(dependencies).forEach(([name, dep]) => {
        if (dep.integrity) {
          expect(typeof dep.integrity).toBe('string');
          expect(dep.integrity).toMatch(integrityPattern);
        }
      });
    });

    test('nested dependencies should have valid structure', () => {
      Object.entries(dependencies).forEach(([name, dep]) => {
        if (dep.requires) {
          expect(typeof dep.requires).toBe('object');
          
          // Each require should have a version range
          Object.entries(dep.requires).forEach(([reqName, reqVersion]) => {
            expect(typeof reqVersion).toBe('string');
            expect(reqVersion.length).toBeGreaterThan(0);
          });
        }
      });
    });

    test('should not have circular dependency references', () => {
      const visited = new Set();
      const recursionStack = new Set();

      function hasCycle(depName, deps) {
        if (recursionStack.has(depName)) {
          return true;
        }
        if (visited.has(depName)) {
          return false;
        }

        visited.add(depName);
        recursionStack.add(depName);

        const dep = deps[depName];
        if (dep && dep.requires) {
          for (const reqName of Object.keys(dep.requires)) {
            if (hasCycle(reqName, deps)) {
              return true;
            }
          }
        }

        recursionStack.delete(depName);
        return false;
      }

      Object.keys(dependencies).forEach(depName => {
        expect(hasCycle(depName, dependencies)).toBe(false);
      });
    });

    test('should not have dependencies with empty version strings', () => {
      Object.entries(dependencies).forEach(([name, dep]) => {
        expect(dep.version).toBeTruthy();
        expect(dep.version.trim()).not.toBe('');
      });
    });

    test('dependency names should follow npm naming conventions', () => {
      // Valid npm package names: lowercase, can have @scope, can have hyphens
      const validNamePattern = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
      
      Object.keys(dependencies).forEach(depName => {
        expect(depName).toMatch(validNamePattern);
      });
    });
  });

  describe('Package.json Consistency', () => {
    let packageLock;

    beforeAll(() => {
      packageLock = JSON.parse(packageLockContent);
    });

    test('all direct dependencies from package.json should be in package-lock.json', () => {
      const packageDeps = {
        ...packageJsonContent.dependencies,
        ...packageJsonContent.devDependencies
      };

      Object.keys(packageDeps).forEach(depName => {
        expect(packageLock.dependencies).toHaveProperty(depName);
      });
    });

    test('direct dependencies should have compatible versions', () => {
      const packageDeps = {
        ...packageJsonContent.dependencies,
        ...packageJsonContent.devDependencies
      };

      Object.entries(packageDeps).forEach(([depName, versionRange]) => {
        if (packageLock.dependencies[depName]) {
          const lockedVersion = packageLock.dependencies[depName].version;
          
          // Basic version compatibility check
          expect(lockedVersion).toBeTruthy();
          
          // If version range is specific (^x.y.z), check major version matches
          if (versionRange.startsWith('^')) {
            const expectedMajor = versionRange.split('.')[0].replace('^', '');
            const actualMajor = lockedVersion.split('.')[0];
            expect(actualMajor).toBe(expectedMajor);
          }
        }
      });
    });
  });

  describe('Security and Integrity', () => {
    let packageLock;

    beforeAll(() => {
      packageLock = JSON.parse(packageLockContent);
    });

    test('should have integrity hashes for most dependencies', () => {
      const dependencies = packageLock.dependencies || {};
      const totalDeps = Object.keys(dependencies).length;
      const depsWithIntegrity = Object.values(dependencies).filter(
        dep => dep.integrity
      ).length;

      // At least 80% of dependencies should have integrity hashes
      const integrityPercentage = (depsWithIntegrity / totalDeps) * 100;
      expect(integrityPercentage).toBeGreaterThan(80);
    });

    test('should not contain file: protocol dependencies', () => {
      const dependencies = packageLock.dependencies || {};
      
      Object.entries(dependencies).forEach(([name, dep]) => {
        if (dep.resolved) {
          expect(dep.resolved).not.toMatch(/^file:/);
        }
        expect(dep.version).not.toMatch(/^file:/);
      });
    });

    test('should not contain git: protocol dependencies', () => {
      const dependencies = packageLock.dependencies || {};
      
      Object.entries(dependencies).forEach(([name, dep]) => {
        if (dep.resolved) {
          // git+ssh and git+https are acceptable, but plain git: is not
          expect(dep.resolved).not.toMatch(/^git:/);
        }
      });
    });

    test('should use HTTPS for resolved URLs', () => {
      const dependencies = packageLock.dependencies || {};
      
      Object.entries(dependencies).forEach(([name, dep]) => {
        if (dep.resolved && dep.resolved.startsWith('http')) {
          expect(dep.resolved).toMatch(/^https:/);
        }
      });
    });
  });

  describe('Edge Cases and Error Conditions', () => {
    test('should handle parsing without throwing on special characters', () => {
      expect(() => JSON.parse(packageLockContent)).not.toThrow();
    });

    test('should not contain undefined or null values', () => {
      const packageLock = JSON.parse(packageLockContent);
      
      function checkForNullish(obj, path = '') {
        if (obj === null) {
          throw new Error(`Found null at path: ${path}`);
        }
        if (obj === undefined) {
          throw new Error(`Found undefined at path: ${path}`);
        }
        
        if (typeof obj === 'object' && obj !== null) {
          Object.entries(obj).forEach(([key, value]) => {
            checkForNullish(value, path ? `${path}.${key}` : key);
          });
        }
      }

      expect(() => checkForNullish(packageLock)).not.toThrow();
    });

    test('should not have extremely long dependency chains', () => {
      const packageLock = JSON.parse(packageLockContent);
      const dependencies = packageLock.dependencies || {};

      function getMaxDepth(depName, deps, visited = new Set()) {
        if (visited.has(depName)) return 0;
        visited.add(depName);

        const dep = deps[depName];
        if (!dep || !dep.requires) return 1;

        const depths = Object.keys(dep.requires).map(reqName =>
          getMaxDepth(reqName, deps, new Set(visited))
        );

        return 1 + Math.max(0, ...depths);
      }

      Object.keys(dependencies).forEach(depName => {
        const depth = getMaxDepth(depName, dependencies);
        // Max depth should be reasonable (< 50 levels)
        expect(depth).toBeLessThan(50);
      });
    });

    test('should not have duplicate dependency entries', () => {
      const packageLock = JSON.parse(packageLockContent);
      const dependencies = packageLock.dependencies || {};
      const depNames = Object.keys(dependencies);
      const uniqueDepNames = new Set(depNames);

      expect(depNames.length).toBe(uniqueDepNames.size);
    });

    test('should handle dependencies with complex version ranges', () => {
      const packageLock = JSON.parse(packageLockContent);
      const dependencies = packageLock.dependencies || {};

      Object.entries(dependencies).forEach(([name, dep]) => {
        if (dep.requires) {
          Object.entries(dep.requires).forEach(([reqName, reqVersion]) => {
            // Should handle ^, ~, >=, etc.
            expect(reqVersion).toMatch(/^[~^><=]?\d+/);
          });
        }
      });
    });
  });

  describe('Performance and Optimization', () => {
    test('should not have excessive file size', () => {
      // Package-lock.json should typically be < 5MB for most projects
      const fileSizeInMB = packageLockContent.length / (1024 * 1024);
      expect(fileSizeInMB).toBeLessThan(5);
    });

    test('should have reasonable number of dependencies', () => {
      const packageLock = JSON.parse(packageLockContent);
      const dependencies = packageLock.dependencies || {};
      const depCount = Object.keys(dependencies).length;

      // A Next.js starter should have < 1000 dependencies
      expect(depCount).toBeLessThan(1000);
      expect(depCount).toBeGreaterThan(10);
    });

    test('should parse efficiently (performance check)', () => {
      const startTime = Date.now();
      JSON.parse(packageLockContent);
      const endTime = Date.now();
      
      const parseTime = endTime - startTime;
      // Parsing should take less than 1 second
      expect(parseTime).toBeLessThan(1000);
    });
  });

  describe('Specific Dependency Validation', () => {
    let packageLock;

    beforeAll(() => {
      packageLock = JSON.parse(packageLockContent);
    });

    test('should include Next.js framework', () => {
      expect(packageLock.dependencies).toHaveProperty('next');
      expect(packageLock.dependencies.next.version).toMatch(/^10\./);
    });

    test('should include React dependencies', () => {
      expect(packageLock.dependencies).toHaveProperty('react');
      expect(packageLock.dependencies).toHaveProperty('react-dom');
      
      // React and React-DOM versions should match
      expect(packageLock.dependencies.react.version).toBe(
        packageLock.dependencies['react-dom'].version
      );
    });

    test('critical dependencies should have integrity hashes', () => {
      const criticalDeps = ['next', 'react', 'react-dom'];
      
      criticalDeps.forEach(depName => {
        if (packageLock.dependencies[depName]) {
          expect(packageLock.dependencies[depName]).toHaveProperty('integrity');
          expect(packageLock.dependencies[depName].integrity).toBeTruthy();
        }
      });
    });
  });
});