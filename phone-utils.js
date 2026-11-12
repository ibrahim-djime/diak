import {
    getCountries,
    getCountryCallingCode,
    parsePhoneNumberFromString
} from "https://esm.sh/libphonenumber-js@1.12.29/max";

const countryNames = new Intl.DisplayNames(["fr"], { type: "region" });

export function listPhoneCountries() {
    return getCountries()
        .map((country) => ({
            country,
            callingCode: getCountryCallingCode(country),
            name: countryNames.of(country) || country
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

export function parseInternationalPhone(value, selectedCountry = "ML") {
    const raw = String(value || "").trim();
    if (!raw) return { valid: false, error: "Saisissez un numéro de téléphone." };

    const defaultCountry = getCountries().includes(selectedCountry) ? selectedCountry : "ML";
    const international = raw.startsWith("+");
    const parsed = parsePhoneNumberFromString(raw, international ? undefined : defaultCountry);
    if (!parsed || !parsed.isValid()) {
        return { valid: false, error: "Ce numéro n'est pas valide pour le pays sélectionné." };
    }

    return {
        valid: true,
        e164: parsed.number,
        country: parsed.country || defaultCountry,
        callingCode: parsed.country ? getCountryCallingCode(parsed.country) : null
    };
}
