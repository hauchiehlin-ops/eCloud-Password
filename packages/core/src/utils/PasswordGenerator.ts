export interface GeneratorConfig {
  length: number;
  upper: boolean;
  lower: boolean;
  number: boolean;
  special: boolean;
}

export class PasswordGenerator {
  static generate(config: GeneratorConfig): string {
    let charset = '';
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // Removed O, I for clarity
    const lower = 'abcdefghijkmnopqrstuvwxyz'; // Removed l
    const numbers = '23456789'; // Removed 0, 1
    const special = '!@#$%^&*()_+';

    if (config.upper) charset += upper;
    if (config.lower) charset += lower;
    if (config.number) charset += numbers;
    if (config.special) charset += special;
    
    if (!charset) return '';

    let pwd = '';
    // Ensure at least one character of each selected type for maximum entropy
    if (config.upper) pwd += upper.charAt(Math.floor(Math.random() * upper.length));
    if (config.lower) pwd += lower.charAt(Math.floor(Math.random() * lower.length));
    if (config.number) pwd += numbers.charAt(Math.floor(Math.random() * numbers.length));
    if (config.special) pwd += special.charAt(Math.floor(Math.random() * special.length));

    for (let i = pwd.length; i < config.length; i++) {
      pwd += charset.charAt(Math.floor(Math.random() * charset.length));
    }

    // Shuffle and ensure first char is a letter to satisfy common website requirements
    let finalPwd = pwd.split('').sort(() => 0.5 - Math.random());
    const letters = (upper + lower).split('');
    if (letters.includes(finalPwd[0]) === false) {
      const firstLetterIdx = finalPwd.findIndex(c => letters.includes(c));
      if (firstLetterIdx !== -1) {
        [finalPwd[0], finalPwd[firstLetterIdx]] = [finalPwd[firstLetterIdx], finalPwd[0]];
      }
    }
    
    return finalPwd.join('');
  }
}
