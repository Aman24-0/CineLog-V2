// src/shared/hooks/__tests__/useFormField.test.ts
import { describe, it, expect } from "vitest";
import { createRoot } from "solid-js";
import { useFormField } from "../useFormField";

describe("useFormField", () => {
  it("starts untouched with initial value and no error", () => {
    createRoot((dispose) => {
      const field = useFormField({
        initialValue: "",
        validate: (v: string) => v.length === 0 ? "Required" : null,
      });
      expect(field.value()).toBe("");
      expect(field.error()).toBeNull();
      expect(field.status()).toBe("untouched");
      expect(field.isUntouched()).toBe(true);
      expect(field.isValid()).toBe(false);
      expect(field.isInvalid()).toBe(false);
      dispose();
    });
  });

  it("touch() triggers validation and sets status", () => {
    createRoot((dispose) => {
      const field = useFormField({
        initialValue: "",
        validate: (v: string) => v.length === 0 ? "Required" : null,
      });
      field.touch();
      expect(field.status()).toBe("invalid");
      expect(field.error()).toBe("Required");
      expect(field.isInvalid()).toBe(true);
      expect(field.isUntouched()).toBe(false);
      dispose();
    });
  });

  it("validate() returns true when valid", () => {
    createRoot((dispose) => {
      const field = useFormField({
        initialValue: "hello",
        validate: (v: string) => v.length === 0 ? "Required" : null,
      });
      expect(field.validate()).toBe(true);
      expect(field.status()).toBe("valid");
      expect(field.error()).toBeNull();
      expect(field.isValid()).toBe(true);
      dispose();
    });
  });

  it("validate() returns false when invalid", () => {
    createRoot((dispose) => {
      const field = useFormField({
        initialValue: "",
        validate: (v: string) => v.length === 0 ? "Required" : null,
      });
      expect(field.validate()).toBe(false);
      expect(field.status()).toBe("invalid");
      expect(field.error()).toBe("Required");
      dispose();
    });
  });

  it("setValue updates value and re-validates if already touched", () => {
    createRoot((dispose) => {
      const field = useFormField({
        initialValue: "",
        validate: (v: string) => v.length === 0 ? "Required" : null,
      });
      // Before touch, setValue doesn't validate
      field.setValue("a");
      expect(field.value()).toBe("a");
      expect(field.error()).toBeNull(); // still untouched, no validation

      // After touch, setValue re-validates
      field.touch();
      expect(field.error()).toBeNull(); // "a" is valid

      field.setValue("");
      expect(field.error()).toBe("Required"); // re-validated because already touched
      dispose();
    });
  });

  it("setValue validates on every change when validateOnChange is true", () => {
    createRoot((dispose) => {
      const field = useFormField({
        initialValue: "",
        validate: (v: string) => v.length === 0 ? "Required" : null,
        validateOnChange: true,
      });
      // Even before touch, validateOnChange triggers validation
      field.setValue("a");
      expect(field.status()).toBe("valid");
      expect(field.error()).toBeNull();

      field.setValue("");
      expect(field.status()).toBe("invalid");
      expect(field.error()).toBe("Required");
      dispose();
    });
  });

  it("reset() restores initial state", () => {
    createRoot((dispose) => {
      const field = useFormField({
        initialValue: "",
        validate: (v: string) => v.length === 0 ? "Required" : null,
      });
      field.setValue("hello");
      field.touch();
      expect(field.status()).toBe("valid");

      field.reset();
      expect(field.value()).toBe("");
      expect(field.error()).toBeNull();
      expect(field.status()).toBe("untouched");
      expect(field.isUntouched()).toBe(true);
      dispose();
    });
  });
});
