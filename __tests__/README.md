# Test Suite Documentation

## Overview
This directory contains comprehensive unit and validation tests for the project.

## Running Tests

### Run all tests
```bash
npm test
```

### Run tests in watch mode
```bash
npm run test:watch
```

### Run tests with coverage
```bash
npm run test:coverage
```

## Test Files

### package-lock.test.js
Comprehensive validation tests for `package-lock.json` that ensure:

1. **File Existence and Accessibility**
   - File exists and is readable
   - Has reasonable file size

2. **JSON Syntax Validation**
   - Valid JSON format
   - No syntax errors (trailing commas, duplicate commas, etc.)
   - Properly balanced brackets and braces
   - Correctly quoted strings and properties

3. **Schema Structure Validation**
   - Required top-level fields (name, version, lockfileVersion, etc.)
   - Consistency with package.json
   - Valid version numbers

4. **Dependency Structure Validation**
   - All dependencies have required fields
   - Valid semver versions
   - Proper URL formats for resolved fields
   - Valid integrity hashes
   - No circular dependencies

5. **Security and Integrity**
   - Integrity hashes present
   - No insecure protocols (file:, git:)
   - HTTPS for all resolved URLs

6. **Edge Cases and Error Conditions**
   - No null or undefined values
   - Reasonable dependency chain depth
   - No duplicate entries
   - Complex version ranges handled correctly

7. **Performance and Optimization**
   - File size within reasonable limits
   - Efficient parsing

8. **Specific Dependency Validation**
   - Critical dependencies present (Next.js, React)
   - Version compatibility checks

## Adding New Tests

When adding new tests, follow these guidelines:

1. Use descriptive test names that clearly state what is being tested
2. Group related tests using `describe` blocks
3. Include comments for complex validation logic
4. Test both happy paths and error conditions
5. Keep tests focused and independent

## Test Best Practices

- **Isolation**: Each test should be independent and not rely on others
- **Clarity**: Test names should clearly describe what is being tested
- **Coverage**: Aim for high code coverage while ensuring meaningful tests
- **Performance**: Tests should run quickly
- **Maintenance**: Keep tests updated as the codebase evolves