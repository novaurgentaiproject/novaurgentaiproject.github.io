// On-device code generation from a curated template library.

export const LANGS = {
  python: { re: /\bpython|\.py\b|\bpy\b|django|flask|pandas/, label: 'Python', fence: 'python' },
  javascript: { re: /\bjavascript|\bjs\b|node(\.?js)?\b|\bexpress\b/, label: 'JavaScript', fence: 'javascript' },
  typescript: { re: /typescript|\bts\b/, label: 'TypeScript', fence: 'typescript' },
  java: { re: /\bjava\b(?!script)/, label: 'Java', fence: 'java' },
  cpp: { re: /c\+\+|\bcpp\b/, label: 'C++', fence: 'cpp' },
  c: { re: /\bin c\b|\bc language\b|\bansi c\b|\bc program\b/, label: 'C', fence: 'c' },
  csharp: { re: /c#|c sharp|csharp|\.net\b/, label: 'C#', fence: 'csharp' },
  go: { re: /\bgolang\b|\bin go\b|\bgo program\b|\bgo code\b/, label: 'Go', fence: 'go' },
  rust: { re: /\brust\b/, label: 'Rust', fence: 'rust' },
  ruby: { re: /\bruby\b|\brails\b/, label: 'Ruby', fence: 'ruby' },
  php: { re: /\bphp\b|laravel/, label: 'PHP', fence: 'php' },
  swift: { re: /\bswift\b|swiftui/, label: 'Swift', fence: 'swift' },
  kotlin: { re: /\bkotlin\b/, label: 'Kotlin', fence: 'kotlin' },
  bash: { re: /\bbash\b|shell script|\bzsh\b|\bterminal command/, label: 'Bash', fence: 'bash' },
  sql: { re: /\bsql\b|mysql|postgres|sqlite|database quer/, label: 'SQL', fence: 'sql' },
  html: { re: /\bhtml\b|website|web ?page|landing page|\bcss\b|portfolio site|frontend/, label: 'HTML', fence: 'html' },
  react: { re: /\breact\b|\bjsx\b/, label: 'React', fence: 'jsx' },
};

export function detectLang(text) {
  const t = text.toLowerCase();
  for (const [k, v] of Object.entries(LANGS)) if (v.re.test(t)) return k;
  return null;
}

const T = [];
const task = (def) => T.push(def);

task({
  id: 'hello', re: /hello,? world|hello world|first program/, title: 'Hello, World',
  explain: ['Prints a greeting to standard output — the classic first program.', 'Use it to confirm your toolchain and environment are set up.'],
  langs: {
    python: 'print("Hello, World!")',
    javascript: 'console.log("Hello, World!");',
    typescript: 'const greeting: string = "Hello, World!";\nconsole.log(greeting);',
    java: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n    }\n}',
    cpp: '#include <iostream>\n\nint main() {\n    std::cout << "Hello, World!" << std::endl;\n    return 0;\n}',
    c: '#include <stdio.h>\n\nint main(void) {\n    printf("Hello, World!\\n");\n    return 0;\n}',
    csharp: 'using System;\n\nclass Program\n{\n    static void Main()\n    {\n        Console.WriteLine("Hello, World!");\n    }\n}',
    go: 'package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("Hello, World!")\n}',
    rust: 'fn main() {\n    println!("Hello, World!");\n}',
    ruby: 'puts "Hello, World!"',
    php: '<?php\necho "Hello, World!\\n";',
    swift: 'print("Hello, World!")',
    kotlin: 'fun main() {\n    println("Hello, World!")\n}',
    bash: '#!/usr/bin/env bash\necho "Hello, World!"',
    html: '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>Hello</title>\n  <style>\n    body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: system-ui; background: linear-gradient(135deg, #0b1846, #3b1f7a); color: #fff; }\n    h1 { font-size: 3rem; }\n  </style>\n</head>\n<body>\n  <h1>Hello, World! 👋</h1>\n</body>\n</html>',
  },
  output: 'Hello, World!',
});

task({
  id: 'fibonacci', re: /fibonacci|\bfib\b/, title: 'Fibonacci sequence',
  explain: ['Builds the sequence iteratively: each number is the sum of the previous two.', 'Iteration avoids the exponential cost of naive recursion.'],
  complexity: 'O(n) time, O(n) space for the list (O(1) if you only need the nth value).',
  langs: {
    python: 'def fibonacci(n: int) -> list[int]:\n    """Return the first n Fibonacci numbers."""\n    seq = []\n    a, b = 0, 1\n    for _ in range(n):\n        seq.append(a)\n        a, b = b, a + b\n    return seq\n\n\nif __name__ == "__main__":\n    print(fibonacci(10))',
    javascript: 'function fibonacci(n) {\n  const seq = [];\n  let [a, b] = [0, 1];\n  for (let i = 0; i < n; i++) {\n    seq.push(a);\n    [a, b] = [b, a + b];\n  }\n  return seq;\n}\n\nconsole.log(fibonacci(10));',
    typescript: 'function fibonacci(n: number): number[] {\n  const seq: number[] = [];\n  let a = 0, b = 1;\n  for (let i = 0; i < n; i++) {\n    seq.push(a);\n    [a, b] = [b, a + b];\n  }\n  return seq;\n}\n\nconsole.log(fibonacci(10));',
    java: 'import java.util.ArrayList;\nimport java.util.List;\n\npublic class Fibonacci {\n    static List<Long> fibonacci(int n) {\n        List<Long> seq = new ArrayList<>();\n        long a = 0, b = 1;\n        for (int i = 0; i < n; i++) {\n            seq.add(a);\n            long next = a + b;\n            a = b;\n            b = next;\n        }\n        return seq;\n    }\n\n    public static void main(String[] args) {\n        System.out.println(fibonacci(10));\n    }\n}',
    cpp: '#include <iostream>\n#include <vector>\n\nstd::vector<long long> fibonacci(int n) {\n    std::vector<long long> seq;\n    long long a = 0, b = 1;\n    for (int i = 0; i < n; ++i) {\n        seq.push_back(a);\n        long long next = a + b;\n        a = b;\n        b = next;\n    }\n    return seq;\n}\n\nint main() {\n    for (auto x : fibonacci(10)) std::cout << x << " ";\n    std::cout << "\\n";\n}',
    c: '#include <stdio.h>\n\nint main(void) {\n    long long a = 0, b = 1;\n    for (int i = 0; i < 10; i++) {\n        printf("%lld ", a);\n        long long next = a + b;\n        a = b;\n        b = next;\n    }\n    printf("\\n");\n    return 0;\n}',
    csharp: 'using System;\nusing System.Collections.Generic;\n\nclass Program\n{\n    static List<long> Fibonacci(int n)\n    {\n        var seq = new List<long>();\n        long a = 0, b = 1;\n        for (int i = 0; i < n; i++)\n        {\n            seq.Add(a);\n            (a, b) = (b, a + b);\n        }\n        return seq;\n    }\n\n    static void Main() => Console.WriteLine(string.Join(", ", Fibonacci(10)));\n}',
    go: 'package main\n\nimport "fmt"\n\nfunc fibonacci(n int) []int {\n\tseq := make([]int, 0, n)\n\ta, b := 0, 1\n\tfor i := 0; i < n; i++ {\n\t\tseq = append(seq, a)\n\t\ta, b = b, a+b\n\t}\n\treturn seq\n}\n\nfunc main() {\n\tfmt.Println(fibonacci(10))\n}',
    rust: 'fn fibonacci(n: usize) -> Vec<u64> {\n    let mut seq = Vec::with_capacity(n);\n    let (mut a, mut b) = (0u64, 1u64);\n    for _ in 0..n {\n        seq.push(a);\n        let next = a + b;\n        a = b;\n        b = next;\n    }\n    seq\n}\n\nfn main() {\n    println!("{:?}", fibonacci(10));\n}',
    ruby: 'def fibonacci(n)\n  seq = []\n  a, b = 0, 1\n  n.times do\n    seq << a\n    a, b = b, a + b\n  end\n  seq\nend\n\np fibonacci(10)',
    swift: 'func fibonacci(_ n: Int) -> [Int] {\n    var seq: [Int] = []\n    var (a, b) = (0, 1)\n    for _ in 0..<n {\n        seq.append(a)\n        (a, b) = (b, a + b)\n    }\n    return seq\n}\n\nprint(fibonacci(10))',
    kotlin: 'fun fibonacci(n: Int): List<Long> {\n    val seq = mutableListOf<Long>()\n    var a = 0L\n    var b = 1L\n    repeat(n) {\n        seq.add(a)\n        val next = a + b\n        a = b\n        b = next\n    }\n    return seq\n}\n\nfun main() = println(fibonacci(10))',
    php: '<?php\nfunction fibonacci(int $n): array {\n    $seq = [];\n    [$a, $b] = [0, 1];\n    for ($i = 0; $i < $n; $i++) {\n        $seq[] = $a;\n        [$a, $b] = [$b, $a + $b];\n    }\n    return $seq;\n}\n\necho implode(", ", fibonacci(10)), "\\n";',
    bash: '#!/usr/bin/env bash\na=0; b=1\nfor ((i = 0; i < 10; i++)); do\n  printf "%d " "$a"\n  next=$((a + b)); a=$b; b=$next\ndone\necho',
  },
  output: '[0, 1, 1, 2, 3, 5, 8, 13, 21, 34]',
});

task({
  id: 'factorial', re: /factorial/, title: 'Factorial',
  explain: ['Multiplies every integer from 1 up to n.', 'Includes both an iterative and a recursive version — the iterative one avoids stack limits.'],
  complexity: 'O(n) time.',
  langs: {
    python: 'def factorial(n: int) -> int:\n    if n < 0:\n        raise ValueError("n must be non-negative")\n    result = 1\n    for i in range(2, n + 1):\n        result *= i\n    return result\n\n\ndef factorial_recursive(n: int) -> int:\n    return 1 if n <= 1 else n * factorial_recursive(n - 1)\n\n\nprint(factorial(5))            # 120\nprint(factorial_recursive(10))  # 3628800',
    javascript: 'function factorial(n) {\n  if (n < 0) throw new RangeError("n must be non-negative");\n  let result = 1n; // BigInt handles large values\n  for (let i = 2n; i <= BigInt(n); i++) result *= i;\n  return result;\n}\n\nconst factorialRecursive = (n) => (n <= 1 ? 1 : n * factorialRecursive(n - 1));\n\nconsole.log(factorial(5).toString());   // 120\nconsole.log(factorialRecursive(10));     // 3628800',
    java: 'import java.math.BigInteger;\n\npublic class Factorial {\n    static BigInteger factorial(int n) {\n        BigInteger result = BigInteger.ONE;\n        for (int i = 2; i <= n; i++) result = result.multiply(BigInteger.valueOf(i));\n        return result;\n    }\n\n    public static void main(String[] args) {\n        System.out.println(factorial(5));   // 120\n        System.out.println(factorial(25));\n    }\n}',
    cpp: '#include <iostream>\n\nunsigned long long factorial(int n) {\n    unsigned long long result = 1;\n    for (int i = 2; i <= n; ++i) result *= i;\n    return result;\n}\n\nint main() {\n    std::cout << factorial(5) << "\\n";  // 120\n}',
    c: '#include <stdio.h>\n\nunsigned long long factorial(int n) {\n    unsigned long long r = 1;\n    for (int i = 2; i <= n; i++) r *= i;\n    return r;\n}\n\nint main(void) {\n    printf("%llu\\n", factorial(5));  /* 120 */\n    return 0;\n}',
    csharp: 'using System;\nusing System.Numerics;\n\nclass Program\n{\n    static BigInteger Factorial(int n)\n    {\n        BigInteger r = 1;\n        for (int i = 2; i <= n; i++) r *= i;\n        return r;\n    }\n\n    static void Main() => Console.WriteLine(Factorial(5)); // 120\n}',
    go: 'package main\n\nimport "fmt"\n\nfunc factorial(n int) uint64 {\n\tvar r uint64 = 1\n\tfor i := 2; i <= n; i++ {\n\t\tr *= uint64(i)\n\t}\n\treturn r\n}\n\nfunc main() {\n\tfmt.Println(factorial(5)) // 120\n}',
    rust: 'fn factorial(n: u64) -> u128 {\n    (1..=n as u128).product()\n}\n\nfn main() {\n    println!("{}", factorial(5)); // 120\n}',
    ruby: 'def factorial(n) = (1..n).reduce(1, :*)\n\nputs factorial(5) # 120',
    swift: 'func factorial(_ n: Int) -> Int {\n    (1...max(n, 1)).reduce(1, *)\n}\n\nprint(factorial(5)) // 120',
    kotlin: 'fun factorial(n: Int): Long = (1..n).fold(1L) { acc, i -> acc * i }\n\nfun main() = println(factorial(5)) // 120',
  },
  output: '120',
});

task({
  id: 'prime', re: /prime/, title: 'Prime numbers',
  explain: ['`is_prime` uses trial division up to √n, skipping even numbers.', '`primes_up_to` uses the Sieve of Eratosthenes to find all primes efficiently.'],
  complexity: 'is_prime: O(√n). Sieve: O(n log log n).',
  langs: {
    python: 'import math\n\n\ndef is_prime(n: int) -> bool:\n    if n < 2:\n        return False\n    if n % 2 == 0:\n        return n == 2\n    for d in range(3, math.isqrt(n) + 1, 2):\n        if n % d == 0:\n            return False\n    return True\n\n\ndef primes_up_to(limit: int) -> list[int]:\n    sieve = [True] * (limit + 1)\n    sieve[0:2] = [False, False]\n    for i in range(2, math.isqrt(limit) + 1):\n        if sieve[i]:\n            sieve[i * i :: i] = [False] * len(sieve[i * i :: i])\n    return [i for i, p in enumerate(sieve) if p]\n\n\nprint(is_prime(97))      # True\nprint(primes_up_to(50))',
    javascript: 'function isPrime(n) {\n  if (n < 2) return false;\n  if (n % 2 === 0) return n === 2;\n  for (let d = 3; d * d <= n; d += 2) if (n % d === 0) return false;\n  return true;\n}\n\nfunction primesUpTo(limit) {\n  const sieve = new Array(limit + 1).fill(true);\n  sieve[0] = sieve[1] = false;\n  for (let i = 2; i * i <= limit; i++) {\n    if (sieve[i]) for (let j = i * i; j <= limit; j += i) sieve[j] = false;\n  }\n  return sieve.reduce((acc, p, i) => (p ? [...acc, i] : acc), []);\n}\n\nconsole.log(isPrime(97));     // true\nconsole.log(primesUpTo(50));',
    java: 'public class Primes {\n    static boolean isPrime(int n) {\n        if (n < 2) return false;\n        if (n % 2 == 0) return n == 2;\n        for (int d = 3; (long) d * d <= n; d += 2) if (n % d == 0) return false;\n        return true;\n    }\n\n    public static void main(String[] args) {\n        for (int i = 2; i <= 50; i++) if (isPrime(i)) System.out.print(i + " ");\n    }\n}',
    cpp: '#include <iostream>\n\nbool isPrime(int n) {\n    if (n < 2) return false;\n    if (n % 2 == 0) return n == 2;\n    for (int d = 3; d * d <= n; d += 2) if (n % d == 0) return false;\n    return true;\n}\n\nint main() {\n    for (int i = 2; i <= 50; ++i) if (isPrime(i)) std::cout << i << " ";\n}',
    go: 'package main\n\nimport "fmt"\n\nfunc isPrime(n int) bool {\n\tif n < 2 {\n\t\treturn false\n\t}\n\tfor d := 2; d*d <= n; d++ {\n\t\tif n%d == 0 {\n\t\t\treturn false\n\t\t}\n\t}\n\treturn true\n}\n\nfunc main() {\n\tfor i := 2; i <= 50; i++ {\n\t\tif isPrime(i) {\n\t\t\tfmt.Print(i, " ")\n\t\t}\n\t}\n}',
    rust: 'fn is_prime(n: u64) -> bool {\n    if n < 2 { return false; }\n    (2..).take_while(|d| d * d <= n).all(|d| n % d != 0)\n}\n\nfn main() {\n    let primes: Vec<u64> = (2..=50).filter(|&n| is_prime(n)).collect();\n    println!("{:?}", primes);\n}',
  },
  output: 'True\n[2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47]',
});

task({
  id: 'reverse', re: /revers(e|ing).*string|string.*revers/, title: 'Reverse a string',
  explain: ['Reverses the characters of a string.', 'The Unicode-aware versions keep emoji and accented characters intact.'],
  complexity: 'O(n).',
  langs: {
    python: 'def reverse_string(s: str) -> str:\n    return s[::-1]\n\n\nprint(reverse_string("Hello, Nova!"))  # !avoN ,olleH',
    javascript: '// Array.from splits by code point, so emoji survive.\nconst reverseString = (s) => Array.from(s).reverse().join("");\n\nconsole.log(reverseString("Hello, Nova! 🚀"));',
    java: 'public class Reverse {\n    public static void main(String[] args) {\n        String s = "Hello, Nova!";\n        System.out.println(new StringBuilder(s).reverse());\n    }\n}',
    cpp: '#include <algorithm>\n#include <iostream>\n#include <string>\n\nint main() {\n    std::string s = "Hello, Nova!";\n    std::reverse(s.begin(), s.end());\n    std::cout << s << "\\n";\n}',
    csharp: 'using System;\n\nclass Program\n{\n    static void Main()\n    {\n        var chars = "Hello, Nova!".ToCharArray();\n        Array.Reverse(chars);\n        Console.WriteLine(new string(chars));\n    }\n}',
    go: 'package main\n\nimport "fmt"\n\nfunc reverse(s string) string {\n\tr := []rune(s)\n\tfor i, j := 0, len(r)-1; i < j; i, j = i+1, j-1 {\n\t\tr[i], r[j] = r[j], r[i]\n\t}\n\treturn string(r)\n}\n\nfunc main() {\n\tfmt.Println(reverse("Hello, Nova!"))\n}',
    rust: 'fn main() {\n    let s = "Hello, Nova!";\n    let reversed: String = s.chars().rev().collect();\n    println!("{}", reversed);\n}',
    ruby: 'puts "Hello, Nova!".reverse',
    php: '<?php\necho strrev("Hello, Nova!"), "\\n";',
    swift: 'print(String("Hello, Nova!".reversed()))',
    kotlin: 'fun main() = println("Hello, Nova!".reversed())',
    c: '#include <stdio.h>\n#include <string.h>\n\nvoid reverse(char *s) {\n    for (size_t i = 0, j = strlen(s) - 1; i < j; i++, j--) {\n        char t = s[i]; s[i] = s[j]; s[j] = t;\n    }\n}\n\nint main(void) {\n    char s[] = "Hello, Nova!";\n    reverse(s);\n    printf("%s\\n", s);\n    return 0;\n}',
  },
  output: '!avoN ,olleH',
});

task({
  id: 'palindrome', re: /palindrome/, title: 'Palindrome checker',
  explain: ['Normalizes the text: lowercase and keep only letters/digits.', 'Compares it with its reverse — "A man, a plan, a canal: Panama" counts!'],
  complexity: 'O(n).',
  langs: {
    python: 'import re\n\n\ndef is_palindrome(text: str) -> bool:\n    cleaned = re.sub(r"[^a-z0-9]", "", text.lower())\n    return cleaned == cleaned[::-1]\n\n\nfor s in ["racecar", "A man, a plan, a canal: Panama", "Nova"]:\n    print(f"{s!r}: {is_palindrome(s)}")',
    javascript: 'function isPalindrome(text) {\n  const cleaned = text.toLowerCase().replace(/[^a-z0-9]/g, "");\n  return cleaned === [...cleaned].reverse().join("");\n}\n\nfor (const s of ["racecar", "A man, a plan, a canal: Panama", "Nova"]) {\n  console.log(`${s}: ${isPalindrome(s)}`);\n}',
    java: 'public class Palindrome {\n    static boolean isPalindrome(String text) {\n        String c = text.toLowerCase().replaceAll("[^a-z0-9]", "");\n        return new StringBuilder(c).reverse().toString().equals(c);\n    }\n\n    public static void main(String[] args) {\n        System.out.println(isPalindrome("A man, a plan, a canal: Panama"));\n    }\n}',
    cpp: '#include <cctype>\n#include <iostream>\n#include <string>\n\nbool isPalindrome(const std::string& s) {\n    int i = 0, j = (int)s.size() - 1;\n    while (i < j) {\n        if (!std::isalnum(s[i])) { ++i; continue; }\n        if (!std::isalnum(s[j])) { --j; continue; }\n        if (std::tolower(s[i++]) != std::tolower(s[j--])) return false;\n    }\n    return true;\n}\n\nint main() {\n    std::cout << std::boolalpha << isPalindrome("A man, a plan, a canal: Panama") << "\\n";\n}',
  },
  output: "'racecar': True\n'A man, a plan, a canal: Panama': True\n'Nova': False",
});

task({
  id: 'fizzbuzz', re: /fizz ?buzz/, title: 'FizzBuzz',
  explain: ['Counts 1–100, printing "Fizz" for multiples of 3, "Buzz" for multiples of 5, and "FizzBuzz" for both.'],
  langs: {
    python: 'for i in range(1, 101):\n    out = ("Fizz" if i % 3 == 0 else "") + ("Buzz" if i % 5 == 0 else "")\n    print(out or i)',
    javascript: 'for (let i = 1; i <= 100; i++) {\n  const out = (i % 3 === 0 ? "Fizz" : "") + (i % 5 === 0 ? "Buzz" : "");\n  console.log(out || i);\n}',
    java: 'public class FizzBuzz {\n    public static void main(String[] args) {\n        for (int i = 1; i <= 100; i++) {\n            String out = (i % 3 == 0 ? "Fizz" : "") + (i % 5 == 0 ? "Buzz" : "");\n            System.out.println(out.isEmpty() ? String.valueOf(i) : out);\n        }\n    }\n}',
    cpp: '#include <iostream>\n\nint main() {\n    for (int i = 1; i <= 100; ++i) {\n        if (i % 15 == 0) std::cout << "FizzBuzz\\n";\n        else if (i % 3 == 0) std::cout << "Fizz\\n";\n        else if (i % 5 == 0) std::cout << "Buzz\\n";\n        else std::cout << i << "\\n";\n    }\n}',
    csharp: 'using System;\n\nfor (int i = 1; i <= 100; i++)\n{\n    var o = (i % 3 == 0 ? "Fizz" : "") + (i % 5 == 0 ? "Buzz" : "");\n    Console.WriteLine(o == "" ? i.ToString() : o);\n}',
    go: 'package main\n\nimport "fmt"\n\nfunc main() {\n\tfor i := 1; i <= 100; i++ {\n\t\tswitch {\n\t\tcase i%15 == 0:\n\t\t\tfmt.Println("FizzBuzz")\n\t\tcase i%3 == 0:\n\t\t\tfmt.Println("Fizz")\n\t\tcase i%5 == 0:\n\t\t\tfmt.Println("Buzz")\n\t\tdefault:\n\t\t\tfmt.Println(i)\n\t\t}\n\t}\n}',
    rust: 'fn main() {\n    for i in 1..=100 {\n        match (i % 3, i % 5) {\n            (0, 0) => println!("FizzBuzz"),\n            (0, _) => println!("Fizz"),\n            (_, 0) => println!("Buzz"),\n            _ => println!("{}", i),\n        }\n    }\n}',
    ruby: '(1..100).each do |i|\n  out = ""\n  out += "Fizz" if (i % 3).zero?\n  out += "Buzz" if (i % 5).zero?\n  puts out.empty? ? i : out\nend',
    bash: '#!/usr/bin/env bash\nfor i in $(seq 1 100); do\n  out=""\n  (( i % 3 == 0 )) && out+="Fizz"\n  (( i % 5 == 0 )) && out+="Buzz"\n  echo "${out:-$i}"\ndone',
  },
  output: '1\n2\nFizz\n4\nBuzz\nFizz\n…\n14\nFizzBuzz',
});

task({
  id: 'sort', re: /\bsort(ing)?\b|quick ?sort|merge ?sort|bubble ?sort/, title: 'Sorting algorithms',
  explain: ['**Quick sort** picks a pivot and partitions into smaller/equal/larger groups, then recurses.', '**Merge sort** splits the list in half, sorts each half and merges them — stable and predictable.', 'In real projects, prefer the built-in sort — it is highly optimized.'],
  complexity: 'Quick sort: O(n log n) average, O(n²) worst. Merge sort: O(n log n) always, O(n) extra space.',
  langs: {
    python: 'def quick_sort(items: list) -> list:\n    if len(items) <= 1:\n        return items\n    pivot = items[len(items) // 2]\n    less = [x for x in items if x < pivot]\n    equal = [x for x in items if x == pivot]\n    greater = [x for x in items if x > pivot]\n    return quick_sort(less) + equal + quick_sort(greater)\n\n\ndef merge_sort(items: list) -> list:\n    if len(items) <= 1:\n        return items\n    mid = len(items) // 2\n    left, right = merge_sort(items[:mid]), merge_sort(items[mid:])\n    merged, i, j = [], 0, 0\n    while i < len(left) and j < len(right):\n        if left[i] <= right[j]:\n            merged.append(left[i]); i += 1\n        else:\n            merged.append(right[j]); j += 1\n    return merged + left[i:] + right[j:]\n\n\ndata = [38, 27, 43, 3, 9, 82, 10]\nprint(quick_sort(data))\nprint(merge_sort(data))\nprint(sorted(data))  # built-in Timsort',
    javascript: 'function quickSort(arr) {\n  if (arr.length <= 1) return arr;\n  const pivot = arr[Math.floor(arr.length / 2)];\n  return [\n    ...quickSort(arr.filter((x) => x < pivot)),\n    ...arr.filter((x) => x === pivot),\n    ...quickSort(arr.filter((x) => x > pivot)),\n  ];\n}\n\nfunction mergeSort(arr) {\n  if (arr.length <= 1) return arr;\n  const mid = arr.length >> 1;\n  const left = mergeSort(arr.slice(0, mid));\n  const right = mergeSort(arr.slice(mid));\n  const out = [];\n  while (left.length && right.length) out.push(left[0] <= right[0] ? left.shift() : right.shift());\n  return [...out, ...left, ...right];\n}\n\nconst data = [38, 27, 43, 3, 9, 82, 10];\nconsole.log(quickSort(data));\nconsole.log(mergeSort(data));\nconsole.log([...data].sort((a, b) => a - b)); // built-in',
    java: 'import java.util.Arrays;\n\npublic class QuickSort {\n    static void quickSort(int[] a, int lo, int hi) {\n        if (lo >= hi) return;\n        int pivot = a[(lo + hi) >>> 1], i = lo, j = hi;\n        while (i <= j) {\n            while (a[i] < pivot) i++;\n            while (a[j] > pivot) j--;\n            if (i <= j) { int t = a[i]; a[i] = a[j]; a[j] = t; i++; j--; }\n        }\n        quickSort(a, lo, j);\n        quickSort(a, i, hi);\n    }\n\n    public static void main(String[] args) {\n        int[] data = {38, 27, 43, 3, 9, 82, 10};\n        quickSort(data, 0, data.length - 1);\n        System.out.println(Arrays.toString(data));\n    }\n}',
    cpp: '#include <iostream>\n#include <vector>\n\nvoid quickSort(std::vector<int>& a, int lo, int hi) {\n    if (lo >= hi) return;\n    int pivot = a[(lo + hi) / 2], i = lo, j = hi;\n    while (i <= j) {\n        while (a[i] < pivot) ++i;\n        while (a[j] > pivot) --j;\n        if (i <= j) std::swap(a[i++], a[j--]);\n    }\n    quickSort(a, lo, j);\n    quickSort(a, i, hi);\n}\n\nint main() {\n    std::vector<int> data{38, 27, 43, 3, 9, 82, 10};\n    quickSort(data, 0, data.size() - 1);\n    for (int x : data) std::cout << x << " ";\n}',
    go: 'package main\n\nimport "fmt"\n\nfunc quickSort(a []int) []int {\n\tif len(a) <= 1 {\n\t\treturn a\n\t}\n\tpivot := a[len(a)/2]\n\tvar less, equal, greater []int\n\tfor _, x := range a {\n\t\tswitch {\n\t\tcase x < pivot:\n\t\t\tless = append(less, x)\n\t\tcase x == pivot:\n\t\t\tequal = append(equal, x)\n\t\tdefault:\n\t\t\tgreater = append(greater, x)\n\t\t}\n\t}\n\treturn append(append(quickSort(less), equal...), quickSort(greater)...)\n}\n\nfunc main() {\n\tfmt.Println(quickSort([]int{38, 27, 43, 3, 9, 82, 10}))\n}',
    rust: 'fn quick_sort(v: &mut [i32]) {\n    if v.len() <= 1 { return; }\n    let p = partition(v);\n    let (left, right) = v.split_at_mut(p);\n    quick_sort(left);\n    quick_sort(&mut right[1..]);\n}\n\nfn partition(v: &mut [i32]) -> usize {\n    let last = v.len() - 1;\n    let mut store = 0;\n    for i in 0..last {\n        if v[i] <= v[last] { v.swap(i, store); store += 1; }\n    }\n    v.swap(store, last);\n    store\n}\n\nfn main() {\n    let mut data = vec![38, 27, 43, 3, 9, 82, 10];\n    quick_sort(&mut data);\n    println!("{:?}", data);\n}',
  },
  output: '[3, 9, 10, 27, 38, 43, 82]',
});

task({
  id: 'binsearch', re: /binary search/, title: 'Binary search',
  explain: ['Works on a **sorted** list by repeatedly halving the search range.', 'Returns the index of the target, or -1 if it is not present.'],
  complexity: 'O(log n) time, O(1) space.',
  langs: {
    python: 'def binary_search(items: list[int], target: int) -> int:\n    lo, hi = 0, len(items) - 1\n    while lo <= hi:\n        mid = (lo + hi) // 2\n        if items[mid] == target:\n            return mid\n        if items[mid] < target:\n            lo = mid + 1\n        else:\n            hi = mid - 1\n    return -1\n\n\nnums = [2, 5, 8, 12, 16, 23, 38, 56, 72, 91]\nprint(binary_search(nums, 23))  # 5\nprint(binary_search(nums, 7))   # -1',
    javascript: 'function binarySearch(items, target) {\n  let lo = 0, hi = items.length - 1;\n  while (lo <= hi) {\n    const mid = (lo + hi) >> 1;\n    if (items[mid] === target) return mid;\n    if (items[mid] < target) lo = mid + 1;\n    else hi = mid - 1;\n  }\n  return -1;\n}\n\nconst nums = [2, 5, 8, 12, 16, 23, 38, 56, 72, 91];\nconsole.log(binarySearch(nums, 23)); // 5\nconsole.log(binarySearch(nums, 7));  // -1',
    java: 'public class BinarySearch {\n    static int search(int[] a, int target) {\n        int lo = 0, hi = a.length - 1;\n        while (lo <= hi) {\n            int mid = (lo + hi) >>> 1;\n            if (a[mid] == target) return mid;\n            if (a[mid] < target) lo = mid + 1; else hi = mid - 1;\n        }\n        return -1;\n    }\n\n    public static void main(String[] args) {\n        int[] nums = {2, 5, 8, 12, 16, 23, 38, 56, 72, 91};\n        System.out.println(search(nums, 23));\n    }\n}',
    cpp: '#include <iostream>\n#include <vector>\n\nint binarySearch(const std::vector<int>& a, int target) {\n    int lo = 0, hi = (int)a.size() - 1;\n    while (lo <= hi) {\n        int mid = lo + (hi - lo) / 2;\n        if (a[mid] == target) return mid;\n        (a[mid] < target ? lo = mid + 1 : hi = mid - 1);\n    }\n    return -1;\n}\n\nint main() {\n    std::cout << binarySearch({2, 5, 8, 12, 16, 23, 38}, 23) << "\\n";\n}',
    go: 'package main\n\nimport "fmt"\n\nfunc binarySearch(a []int, target int) int {\n\tlo, hi := 0, len(a)-1\n\tfor lo <= hi {\n\t\tmid := (lo + hi) / 2\n\t\tswitch {\n\t\tcase a[mid] == target:\n\t\t\treturn mid\n\t\tcase a[mid] < target:\n\t\t\tlo = mid + 1\n\t\tdefault:\n\t\t\thi = mid - 1\n\t\t}\n\t}\n\treturn -1\n}\n\nfunc main() {\n\tfmt.Println(binarySearch([]int{2, 5, 8, 12, 16, 23, 38}, 23))\n}',
    rust: 'fn main() {\n    let nums = [2, 5, 8, 12, 16, 23, 38, 56, 72, 91];\n    match nums.binary_search(&23) {\n        Ok(i) => println!("found at {}", i),\n        Err(_) => println!("not found"),\n    }\n}',
  },
  output: '5\n-1',
});

task({
  id: 'fetch', re: /fetch|http request|api call|call (an|a|the) api|get request|post request|rest client/, title: 'Calling an HTTP API',
  explain: ['Sends a GET request and parses the JSON response.', 'Checks the status code and handles network errors gracefully.', 'Uses a free public API (Open-Meteo) so it runs without a key.'],
  langs: {
    python: 'import requests\n\nURL = "https://api.open-meteo.com/v1/forecast"\nparams = {"latitude": 48.85, "longitude": 2.35, "current": "temperature_2m,wind_speed_10m"}\n\ntry:\n    response = requests.get(URL, params=params, timeout=10)\n    response.raise_for_status()\n    data = response.json()\n    current = data["current"]\n    print(f"Paris: {current[\'temperature_2m\']}°C, wind {current[\'wind_speed_10m\']} km/h")\nexcept requests.RequestException as err:\n    print(f"Request failed: {err}")',
    javascript: 'async function getWeather(lat, lon) {\n  const url = new URL("https://api.open-meteo.com/v1/forecast");\n  url.search = new URLSearchParams({ latitude: lat, longitude: lon, current: "temperature_2m,wind_speed_10m" });\n\n  try {\n    const res = await fetch(url);\n    if (!res.ok) throw new Error(`HTTP ${res.status}`);\n    const data = await res.json();\n    const { temperature_2m, wind_speed_10m } = data.current;\n    console.log(`Paris: ${temperature_2m}°C, wind ${wind_speed_10m} km/h`);\n  } catch (err) {\n    console.error("Request failed:", err.message);\n  }\n}\n\ngetWeather(48.85, 2.35);',
    typescript: 'interface Weather { current: { temperature_2m: number; wind_speed_10m: number } }\n\nasync function getWeather(lat: number, lon: number): Promise<Weather> {\n  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,wind_speed_10m`;\n  const res = await fetch(url);\n  if (!res.ok) throw new Error(`HTTP ${res.status}`);\n  return (await res.json()) as Weather;\n}\n\ngetWeather(48.85, 2.35).then((w) => console.log(`${w.current.temperature_2m}°C`));',
    go: 'package main\n\nimport (\n\t"encoding/json"\n\t"fmt"\n\t"net/http"\n)\n\ntype Weather struct {\n\tCurrent struct {\n\t\tTemp float64 `json:"temperature_2m"`\n\t} `json:"current"`\n}\n\nfunc main() {\n\tresp, err := http.Get("https://api.open-meteo.com/v1/forecast?latitude=48.85&longitude=2.35&current=temperature_2m")\n\tif err != nil {\n\t\tpanic(err)\n\t}\n\tdefer resp.Body.Close()\n\tvar w Weather\n\tjson.NewDecoder(resp.Body).Decode(&w)\n\tfmt.Printf("Paris: %.1f°C\\n", w.Current.Temp)\n}',
    java: 'import java.net.URI;\nimport java.net.http.HttpClient;\nimport java.net.http.HttpRequest;\nimport java.net.http.HttpResponse;\n\npublic class Fetch {\n    public static void main(String[] args) throws Exception {\n        var client = HttpClient.newHttpClient();\n        var request = HttpRequest.newBuilder(URI.create(\n            "https://api.open-meteo.com/v1/forecast?latitude=48.85&longitude=2.35&current=temperature_2m")).build();\n        HttpResponse<String> res = client.send(request, HttpResponse.BodyHandlers.ofString());\n        System.out.println(res.statusCode());\n        System.out.println(res.body());\n    }\n}',
    bash: '#!/usr/bin/env bash\ncurl -s "https://api.open-meteo.com/v1/forecast?latitude=48.85&longitude=2.35&current=temperature_2m" \\\n  | python3 -m json.tool',
  },
});

task({
  id: 'fileio', re: /read (a |the )?file|write (to )?(a |the )?file|file i\/?o|save to (a )?file|read.*csv|csv file|json file/, title: 'Reading and writing files',
  explain: ['Writes text and JSON to disk, then reads them back.', 'Uses context managers / try-blocks so files are always closed.'],
  langs: {
    python: 'import csv\nimport json\nfrom pathlib import Path\n\n# Text\nPath("notes.txt").write_text("Hello from Nova!\\nSecond line.", encoding="utf-8")\nprint(Path("notes.txt").read_text(encoding="utf-8"))\n\n# JSON\ndata = {"name": "Nova", "models": 6}\nwith open("data.json", "w", encoding="utf-8") as f:\n    json.dump(data, f, indent=2)\nwith open("data.json", encoding="utf-8") as f:\n    print(json.load(f))\n\n# CSV\nrows = [["model", "speed"], ["Nova 2 Flash", "fast"], ["Nova 3 Martia", "thorough"]]\nwith open("models.csv", "w", newline="", encoding="utf-8") as f:\n    csv.writer(f).writerows(rows)\nwith open("models.csv", newline="", encoding="utf-8") as f:\n    for row in csv.DictReader(f):\n        print(row["model"], "→", row["speed"])',
    javascript: 'import { readFile, writeFile } from "node:fs/promises";\n\nasync function main() {\n  await writeFile("notes.txt", "Hello from Nova!\\nSecond line.", "utf8");\n  console.log(await readFile("notes.txt", "utf8"));\n\n  const data = { name: "Nova", models: 6 };\n  await writeFile("data.json", JSON.stringify(data, null, 2));\n  console.log(JSON.parse(await readFile("data.json", "utf8")));\n}\n\nmain().catch(console.error);',
    java: 'import java.nio.file.*;\nimport java.util.List;\n\npublic class FileIO {\n    public static void main(String[] args) throws Exception {\n        Path p = Path.of("notes.txt");\n        Files.writeString(p, "Hello from Nova!\\nSecond line.");\n        List<String> lines = Files.readAllLines(p);\n        lines.forEach(System.out::println);\n    }\n}',
    go: 'package main\n\nimport (\n\t"fmt"\n\t"os"\n)\n\nfunc main() {\n\tif err := os.WriteFile("notes.txt", []byte("Hello from Nova!\\n"), 0644); err != nil {\n\t\tpanic(err)\n\t}\n\tdata, err := os.ReadFile("notes.txt")\n\tif err != nil {\n\t\tpanic(err)\n\t}\n\tfmt.Print(string(data))\n}',
    csharp: 'using System;\nusing System.IO;\n\nFile.WriteAllText("notes.txt", "Hello from Nova!\\nSecond line.");\nforeach (var line in File.ReadAllLines("notes.txt"))\n    Console.WriteLine(line);',
    rust: 'use std::fs;\n\nfn main() -> std::io::Result<()> {\n    fs::write("notes.txt", "Hello from Nova!\\n")?;\n    let text = fs::read_to_string("notes.txt")?;\n    print!("{}", text);\n    Ok(())\n}',
  },
});

task({
  id: 'class', re: /\bclass\b|object.oriented|\boop\b|bank account|inheritance/, title: 'Classes & objects (bank account)',
  explain: ['`BankAccount` encapsulates a balance with validated deposit/withdraw methods.', '`SavingsAccount` shows inheritance by adding interest.', 'Errors are raised for invalid operations instead of failing silently.'],
  langs: {
    python: 'class BankAccount:\n    def __init__(self, owner: str, balance: float = 0.0):\n        self.owner = owner\n        self._balance = balance\n\n    @property\n    def balance(self) -> float:\n        return self._balance\n\n    def deposit(self, amount: float) -> None:\n        if amount <= 0:\n            raise ValueError("Deposit must be positive")\n        self._balance += amount\n\n    def withdraw(self, amount: float) -> None:\n        if amount > self._balance:\n            raise ValueError("Insufficient funds")\n        self._balance -= amount\n\n    def __repr__(self) -> str:\n        return f"{self.__class__.__name__}({self.owner!r}, balance={self._balance:.2f})"\n\n\nclass SavingsAccount(BankAccount):\n    def __init__(self, owner: str, balance: float = 0.0, rate: float = 0.03):\n        super().__init__(owner, balance)\n        self.rate = rate\n\n    def add_interest(self) -> None:\n        self.deposit(self.balance * self.rate)\n\n\nacct = SavingsAccount("Ada", 1000)\nacct.deposit(250)\nacct.withdraw(100)\nacct.add_interest()\nprint(acct)',
    javascript: 'class BankAccount {\n  #balance;\n  constructor(owner, balance = 0) {\n    this.owner = owner;\n    this.#balance = balance;\n  }\n  get balance() { return this.#balance; }\n  deposit(amount) {\n    if (amount <= 0) throw new Error("Deposit must be positive");\n    this.#balance += amount;\n  }\n  withdraw(amount) {\n    if (amount > this.#balance) throw new Error("Insufficient funds");\n    this.#balance -= amount;\n  }\n  toString() { return `${this.constructor.name}(${this.owner}, ${this.#balance.toFixed(2)})`; }\n}\n\nclass SavingsAccount extends BankAccount {\n  constructor(owner, balance = 0, rate = 0.03) {\n    super(owner, balance);\n    this.rate = rate;\n  }\n  addInterest() { this.deposit(this.balance * this.rate); }\n}\n\nconst acct = new SavingsAccount("Ada", 1000);\nacct.deposit(250);\nacct.withdraw(100);\nacct.addInterest();\nconsole.log(String(acct));',
    java: 'public class Main {\n    static class BankAccount {\n        private final String owner;\n        protected double balance;\n        BankAccount(String owner, double balance) { this.owner = owner; this.balance = balance; }\n        void deposit(double amt) {\n            if (amt <= 0) throw new IllegalArgumentException("Deposit must be positive");\n            balance += amt;\n        }\n        void withdraw(double amt) {\n            if (amt > balance) throw new IllegalStateException("Insufficient funds");\n            balance -= amt;\n        }\n        @Override public String toString() { return String.format("%s: %.2f", owner, balance); }\n    }\n\n    static class SavingsAccount extends BankAccount {\n        private final double rate;\n        SavingsAccount(String owner, double balance, double rate) { super(owner, balance); this.rate = rate; }\n        void addInterest() { deposit(balance * rate); }\n    }\n\n    public static void main(String[] args) {\n        SavingsAccount a = new SavingsAccount("Ada", 1000, 0.03);\n        a.deposit(250);\n        a.withdraw(100);\n        a.addInterest();\n        System.out.println(a);\n    }\n}',
    csharp: 'using System;\n\nclass BankAccount\n{\n    public string Owner { get; }\n    public decimal Balance { get; protected set; }\n    public BankAccount(string owner, decimal balance = 0) { Owner = owner; Balance = balance; }\n    public void Deposit(decimal amt) { if (amt <= 0) throw new ArgumentException("Deposit must be positive"); Balance += amt; }\n    public void Withdraw(decimal amt) { if (amt > Balance) throw new InvalidOperationException("Insufficient funds"); Balance -= amt; }\n    public override string ToString() => $"{Owner}: {Balance:C}";\n}\n\nclass SavingsAccount : BankAccount\n{\n    private readonly decimal _rate;\n    public SavingsAccount(string owner, decimal balance, decimal rate) : base(owner, balance) => _rate = rate;\n    public void AddInterest() => Deposit(Balance * _rate);\n}\n\nclass Program\n{\n    static void Main()\n    {\n        var a = new SavingsAccount("Ada", 1000m, 0.03m);\n        a.Deposit(250); a.Withdraw(100); a.AddInterest();\n        Console.WriteLine(a);\n    }\n}',
    cpp: '#include <iostream>\n#include <stdexcept>\n#include <string>\n\nclass BankAccount {\npublic:\n    BankAccount(std::string owner, double balance) : owner_(std::move(owner)), balance_(balance) {}\n    virtual ~BankAccount() = default;\n    void deposit(double amt) {\n        if (amt <= 0) throw std::invalid_argument("Deposit must be positive");\n        balance_ += amt;\n    }\n    void withdraw(double amt) {\n        if (amt > balance_) throw std::runtime_error("Insufficient funds");\n        balance_ -= amt;\n    }\n    double balance() const { return balance_; }\nprotected:\n    std::string owner_;\n    double balance_;\n};\n\nclass SavingsAccount : public BankAccount {\npublic:\n    SavingsAccount(std::string owner, double balance, double rate) : BankAccount(std::move(owner), balance), rate_(rate) {}\n    void addInterest() { deposit(balance_ * rate_); }\nprivate:\n    double rate_;\n};\n\nint main() {\n    SavingsAccount a("Ada", 1000, 0.03);\n    a.deposit(250); a.withdraw(100); a.addInterest();\n    std::cout << a.balance() << "\\n";\n}',
    ruby: 'class BankAccount\n  attr_reader :owner, :balance\n\n  def initialize(owner, balance = 0)\n    @owner = owner\n    @balance = balance\n  end\n\n  def deposit(amount)\n    raise ArgumentError, "Deposit must be positive" unless amount.positive?\n    @balance += amount\n  end\n\n  def withdraw(amount)\n    raise "Insufficient funds" if amount > @balance\n    @balance -= amount\n  end\nend\n\nacct = BankAccount.new("Ada", 1000)\nacct.deposit(250)\nacct.withdraw(100)\nputs acct.balance',
    go: 'package main\n\nimport (\n\t"errors"\n\t"fmt"\n)\n\ntype BankAccount struct {\n\tOwner   string\n\tbalance float64\n}\n\nfunc (a *BankAccount) Deposit(amt float64) error {\n\tif amt <= 0 {\n\t\treturn errors.New("deposit must be positive")\n\t}\n\ta.balance += amt\n\treturn nil\n}\n\nfunc (a *BankAccount) Withdraw(amt float64) error {\n\tif amt > a.balance {\n\t\treturn errors.New("insufficient funds")\n\t}\n\ta.balance -= amt\n\treturn nil\n}\n\nfunc main() {\n\tacct := &BankAccount{Owner: "Ada", balance: 1000}\n\tacct.Deposit(250)\n\tacct.Withdraw(100)\n\tfmt.Printf("%s: %.2f\\n", acct.Owner, acct.balance)\n}',
    rust: 'struct BankAccount {\n    owner: String,\n    balance: f64,\n}\n\nimpl BankAccount {\n    fn new(owner: &str, balance: f64) -> Self { Self { owner: owner.into(), balance } }\n    fn deposit(&mut self, amt: f64) -> Result<(), String> {\n        if amt <= 0.0 { return Err("deposit must be positive".into()); }\n        self.balance += amt;\n        Ok(())\n    }\n    fn withdraw(&mut self, amt: f64) -> Result<(), String> {\n        if amt > self.balance { return Err("insufficient funds".into()); }\n        self.balance -= amt;\n        Ok(())\n    }\n}\n\nfn main() {\n    let mut a = BankAccount::new("Ada", 1000.0);\n    a.deposit(250.0).unwrap();\n    a.withdraw(100.0).unwrap();\n    println!("{}: {:.2}", a.owner, a.balance);\n}',
  },
});

task({
  id: 'linkedlist', re: /linked list/, title: 'Linked list',
  explain: ['Each node stores a value and a pointer to the next node.', 'Supports append, prepend, delete and iteration.'],
  complexity: 'Prepend O(1); append/delete/search O(n).',
  langs: {
    python: 'from dataclasses import dataclass\nfrom typing import Iterator, Optional\n\n\n@dataclass\nclass Node:\n    value: int\n    next: Optional["Node"] = None\n\n\nclass LinkedList:\n    def __init__(self):\n        self.head: Optional[Node] = None\n\n    def append(self, value: int) -> None:\n        node = Node(value)\n        if not self.head:\n            self.head = node\n            return\n        cur = self.head\n        while cur.next:\n            cur = cur.next\n        cur.next = node\n\n    def prepend(self, value: int) -> None:\n        self.head = Node(value, self.head)\n\n    def delete(self, value: int) -> bool:\n        prev, cur = None, self.head\n        while cur:\n            if cur.value == value:\n                if prev:\n                    prev.next = cur.next\n                else:\n                    self.head = cur.next\n                return True\n            prev, cur = cur, cur.next\n        return False\n\n    def __iter__(self) -> Iterator[int]:\n        cur = self.head\n        while cur:\n            yield cur.value\n            cur = cur.next\n\n\nll = LinkedList()\nfor v in [3, 5, 8]:\n    ll.append(v)\nll.prepend(1)\nll.delete(5)\nprint(" -> ".join(map(str, ll)))  # 1 -> 3 -> 8',
    javascript: 'class Node {\n  constructor(value, next = null) {\n    this.value = value;\n    this.next = next;\n  }\n}\n\nclass LinkedList {\n  head = null;\n  append(value) {\n    const node = new Node(value);\n    if (!this.head) return void (this.head = node);\n    let cur = this.head;\n    while (cur.next) cur = cur.next;\n    cur.next = node;\n  }\n  prepend(value) { this.head = new Node(value, this.head); }\n  delete(value) {\n    if (!this.head) return false;\n    if (this.head.value === value) { this.head = this.head.next; return true; }\n    for (let cur = this.head; cur.next; cur = cur.next) {\n      if (cur.next.value === value) { cur.next = cur.next.next; return true; }\n    }\n    return false;\n  }\n  *[Symbol.iterator]() {\n    for (let cur = this.head; cur; cur = cur.next) yield cur.value;\n  }\n}\n\nconst list = new LinkedList();\n[3, 5, 8].forEach((v) => list.append(v));\nlist.prepend(1);\nlist.delete(5);\nconsole.log([...list].join(" -> ")); // 1 -> 3 -> 8',
    java: 'public class LinkedList {\n    static class Node { int value; Node next; Node(int v) { value = v; } }\n    Node head;\n\n    void append(int v) {\n        Node n = new Node(v);\n        if (head == null) { head = n; return; }\n        Node cur = head;\n        while (cur.next != null) cur = cur.next;\n        cur.next = n;\n    }\n\n    public static void main(String[] args) {\n        LinkedList l = new LinkedList();\n        l.append(1); l.append(3); l.append(8);\n        for (Node c = l.head; c != null; c = c.next) System.out.print(c.value + " ");\n    }\n}',
    cpp: '#include <iostream>\n#include <memory>\n\nstruct Node {\n    int value;\n    std::unique_ptr<Node> next;\n};\n\nint main() {\n    auto head = std::make_unique<Node>(Node{1, nullptr});\n    head->next = std::make_unique<Node>(Node{3, nullptr});\n    head->next->next = std::make_unique<Node>(Node{8, nullptr});\n    for (Node* c = head.get(); c; c = c->next.get()) std::cout << c->value << " ";\n}',
  },
});

task({
  id: 'stack', re: /\bstack\b|\bqueue\b/, title: 'Stack and queue',
  explain: ['A **stack** is last-in, first-out (push/pop).', 'A **queue** is first-in, first-out — `deque` gives O(1) operations at both ends.'],
  langs: {
    python: 'from collections import deque\n\n# Stack (LIFO)\nstack = []\nstack.append("a")\nstack.append("b")\nprint(stack.pop())  # b\n\n# Queue (FIFO)\nqueue = deque()\nqueue.append("first")\nqueue.append("second")\nprint(queue.popleft())  # first\n\n\n# Classic use: balanced brackets\ndef balanced(s: str) -> bool:\n    pairs = {")": "(", "]": "[", "}": "{"}\n    st = []\n    for ch in s:\n        if ch in "([{":\n            st.append(ch)\n        elif ch in pairs:\n            if not st or st.pop() != pairs[ch]:\n                return False\n    return not st\n\n\nprint(balanced("{[()()]}"))  # True',
    javascript: '// Stack (LIFO)\nconst stack = [];\nstack.push("a");\nstack.push("b");\nconsole.log(stack.pop()); // b\n\n// Queue (FIFO) with O(1) dequeue\nclass Queue {\n  #items = {};\n  #head = 0;\n  #tail = 0;\n  enqueue(x) { this.#items[this.#tail++] = x; }\n  dequeue() {\n    if (this.#head === this.#tail) return undefined;\n    const x = this.#items[this.#head];\n    delete this.#items[this.#head++];\n    return x;\n  }\n  get size() { return this.#tail - this.#head; }\n}\n\nconst q = new Queue();\nq.enqueue("first");\nq.enqueue("second");\nconsole.log(q.dequeue()); // first',
  },
});

task({
  id: 'server', re: /web server|http server|rest api|api endpoint|\bexpress\b|\bflask\b|fastapi|backend|crud api/, title: 'REST API server',
  explain: ['Exposes CRUD endpoints for a simple in-memory "todos" resource.', 'Returns proper status codes (201 on create, 404 when missing).', 'Swap the in-memory list for a database when you\'re ready.'],
  langs: {
    python: '# pip install flask\nfrom flask import Flask, jsonify, request, abort\n\napp = Flask(__name__)\ntodos = [{"id": 1, "title": "Try Nova", "done": False}]\n\n\n@app.get("/api/todos")\ndef list_todos():\n    return jsonify(todos)\n\n\n@app.post("/api/todos")\ndef create_todo():\n    body = request.get_json(force=True)\n    if not body or not body.get("title"):\n        abort(400, "title is required")\n    todo = {"id": max((t["id"] for t in todos), default=0) + 1, "title": body["title"], "done": False}\n    todos.append(todo)\n    return jsonify(todo), 201\n\n\n@app.patch("/api/todos/<int:todo_id>")\ndef update_todo(todo_id: int):\n    todo = next((t for t in todos if t["id"] == todo_id), None)\n    if todo is None:\n        abort(404)\n    todo.update({k: v for k, v in request.get_json(force=True).items() if k in ("title", "done")})\n    return jsonify(todo)\n\n\n@app.delete("/api/todos/<int:todo_id>")\ndef delete_todo(todo_id: int):\n    global todos\n    todos = [t for t in todos if t["id"] != todo_id]\n    return "", 204\n\n\nif __name__ == "__main__":\n    app.run(debug=True, port=5000)',
    javascript: '// npm install express\nimport express from "express";\n\nconst app = express();\napp.use(express.json());\n\nlet todos = [{ id: 1, title: "Try Nova", done: false }];\nlet nextId = 2;\n\napp.get("/api/todos", (req, res) => res.json(todos));\n\napp.post("/api/todos", (req, res) => {\n  const { title } = req.body ?? {};\n  if (!title) return res.status(400).json({ error: "title is required" });\n  const todo = { id: nextId++, title, done: false };\n  todos.push(todo);\n  res.status(201).json(todo);\n});\n\napp.patch("/api/todos/:id", (req, res) => {\n  const todo = todos.find((t) => t.id === Number(req.params.id));\n  if (!todo) return res.sendStatus(404);\n  Object.assign(todo, req.body);\n  res.json(todo);\n});\n\napp.delete("/api/todos/:id", (req, res) => {\n  todos = todos.filter((t) => t.id !== Number(req.params.id));\n  res.sendStatus(204);\n});\n\napp.listen(3000, () => console.log("API running on http://localhost:3000"));',
    go: 'package main\n\nimport (\n\t"encoding/json"\n\t"log"\n\t"net/http"\n)\n\ntype Todo struct {\n\tID    int    `json:"id"`\n\tTitle string `json:"title"`\n\tDone  bool   `json:"done"`\n}\n\nvar todos = []Todo{{1, "Try Nova", false}}\n\nfunc main() {\n\thttp.HandleFunc("GET /api/todos", func(w http.ResponseWriter, r *http.Request) {\n\t\tjson.NewEncoder(w).Encode(todos)\n\t})\n\thttp.HandleFunc("POST /api/todos", func(w http.ResponseWriter, r *http.Request) {\n\t\tvar t Todo\n\t\tif err := json.NewDecoder(r.Body).Decode(&t); err != nil || t.Title == "" {\n\t\t\thttp.Error(w, "title is required", http.StatusBadRequest)\n\t\t\treturn\n\t\t}\n\t\tt.ID = len(todos) + 1\n\t\ttodos = append(todos, t)\n\t\tw.WriteHeader(http.StatusCreated)\n\t\tjson.NewEncoder(w).Encode(t)\n\t})\n\tlog.Println("listening on :8080")\n\tlog.Fatal(http.ListenAndServe(":8080", nil))\n}',
  },
});

task({
  id: 'guess', re: /guess(ing)? (the |a )?number|number guessing|guessing game/, title: 'Number guessing game',
  explain: ['Picks a random number from 1–100.', 'Gives "higher/lower" hints and counts attempts.', 'Validates input so typos don\'t crash the game.'],
  langs: {
    python: 'import random\n\n\ndef play() -> None:\n    secret = random.randint(1, 100)\n    attempts = 0\n    print("I\'m thinking of a number between 1 and 100.")\n    while True:\n        guess = input("Your guess: ")\n        if not guess.isdigit():\n            print("Please enter a whole number.")\n            continue\n        attempts += 1\n        n = int(guess)\n        if n < secret:\n            print("Higher! ⬆️")\n        elif n > secret:\n            print("Lower! ⬇️")\n        else:\n            print(f"🎉 Correct! You got it in {attempts} attempts.")\n            break\n\n\nif __name__ == "__main__":\n    play()',
    javascript: 'import readline from "node:readline/promises";\nimport { stdin as input, stdout as output } from "node:process";\n\nconst rl = readline.createInterface({ input, output });\nconst secret = Math.floor(Math.random() * 100) + 1;\nlet attempts = 0;\n\nconsole.log("I\'m thinking of a number between 1 and 100.");\nwhile (true) {\n  const guess = Number(await rl.question("Your guess: "));\n  if (!Number.isInteger(guess)) { console.log("Please enter a whole number."); continue; }\n  attempts++;\n  if (guess < secret) console.log("Higher! ⬆️");\n  else if (guess > secret) console.log("Lower! ⬇️");\n  else { console.log(`🎉 Correct in ${attempts} attempts!`); break; }\n}\nrl.close();',
    java: 'import java.util.Random;\nimport java.util.Scanner;\n\npublic class GuessGame {\n    public static void main(String[] args) {\n        int secret = new Random().nextInt(100) + 1, attempts = 0;\n        Scanner in = new Scanner(System.in);\n        System.out.println("Guess a number between 1 and 100.");\n        while (true) {\n            int g = in.nextInt();\n            attempts++;\n            if (g < secret) System.out.println("Higher!");\n            else if (g > secret) System.out.println("Lower!");\n            else { System.out.println("Correct in " + attempts + " attempts!"); break; }\n        }\n    }\n}',
    cpp: '#include <iostream>\n#include <random>\n\nint main() {\n    std::mt19937 rng(std::random_device{}());\n    int secret = std::uniform_int_distribution<>(1, 100)(rng), guess = 0, attempts = 0;\n    std::cout << "Guess a number between 1 and 100\\n";\n    while (guess != secret) {\n        std::cin >> guess;\n        ++attempts;\n        if (guess < secret) std::cout << "Higher!\\n";\n        else if (guess > secret) std::cout << "Lower!\\n";\n    }\n    std::cout << "Correct in " << attempts << " attempts!\\n";\n}',
  },
});

task({
  id: 'password', re: /password/, title: 'Secure password generator',
  explain: ['Uses a cryptographically secure random source (not `random`).', 'Guarantees at least one lowercase, uppercase, digit and symbol.'],
  langs: {
    python: 'import secrets\nimport string\n\n\ndef generate_password(length: int = 16) -> str:\n    if length < 4:\n        raise ValueError("length must be at least 4")\n    pools = [string.ascii_lowercase, string.ascii_uppercase, string.digits, "!@#$%^&*()-_=+"]\n    chars = [secrets.choice(pool) for pool in pools]\n    everything = "".join(pools)\n    chars += [secrets.choice(everything) for _ in range(length - len(chars))]\n    secrets.SystemRandom().shuffle(chars)\n    return "".join(chars)\n\n\nprint(generate_password(20))',
    javascript: 'function generatePassword(length = 16) {\n  const pools = ["abcdefghijklmnopqrstuvwxyz", "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "0123456789", "!@#$%^&*()-_=+"];\n  const all = pools.join("");\n  const rand = (max) => crypto.getRandomValues(new Uint32Array(1))[0] % max;\n  const chars = pools.map((p) => p[rand(p.length)]);\n  while (chars.length < length) chars.push(all[rand(all.length)]);\n  for (let i = chars.length - 1; i > 0; i--) {\n    const j = rand(i + 1);\n    [chars[i], chars[j]] = [chars[j], chars[i]];\n  }\n  return chars.join("");\n}\n\nconsole.log(generatePassword(20));',
  },
});

task({
  id: 'temperature', re: /temperature conver|celsius|fahrenheit/, title: 'Temperature converter',
  explain: ['°F = °C × 9/5 + 32 and °C = (°F − 32) × 5/9.', 'Includes Kelvin and input validation.'],
  langs: {
    python: 'def c_to_f(c: float) -> float:\n    return c * 9 / 5 + 32\n\n\ndef f_to_c(f: float) -> float:\n    return (f - 32) * 5 / 9\n\n\ndef c_to_k(c: float) -> float:\n    if c < -273.15:\n        raise ValueError("Below absolute zero!")\n    return c + 273.15\n\n\nfor c in (-40, 0, 37, 100):\n    print(f"{c:>6}°C = {c_to_f(c):>6.1f}°F = {c_to_k(c):.2f}K")',
    javascript: 'const cToF = (c) => (c * 9) / 5 + 32;\nconst fToC = (f) => ((f - 32) * 5) / 9;\nconst cToK = (c) => {\n  if (c < -273.15) throw new RangeError("Below absolute zero!");\n  return c + 273.15;\n};\n\nfor (const c of [-40, 0, 37, 100]) {\n  console.log(`${c}°C = ${cToF(c).toFixed(1)}°F = ${cToK(c).toFixed(2)}K`);\n}',
  },
  output: '   -40°C =  -40.0°F = 233.15K\n     0°C =   32.0°F = 273.15K\n    37°C =   98.6°F = 310.15K\n   100°C =  212.0°F = 373.15K',
});

task({
  id: 'wordcount', re: /word count|count (the )?words|word frequenc|most common words/, title: 'Word frequency counter',
  explain: ['Normalizes text to lowercase and extracts words with a regex.', 'Counts occurrences and prints the most common ones.'],
  langs: {
    python: 'import re\nfrom collections import Counter\n\ntext = """Nova is fast. Nova is creative, and Nova can code.\nCreative tools make creative people faster."""\n\nwords = re.findall(r"[a-z\']+", text.lower())\ncounts = Counter(words)\n\nprint(f"Total words: {len(words)}  Unique: {len(counts)}")\nfor word, n in counts.most_common(5):\n    print(f"{word:<10} {n}")',
    javascript: 'const text = `Nova is fast. Nova is creative, and Nova can code.\nCreative tools make creative people faster.`;\n\nconst words = text.toLowerCase().match(/[a-z\']+/g) ?? [];\nconst counts = words.reduce((m, w) => m.set(w, (m.get(w) ?? 0) + 1), new Map());\n\nconsole.log(`Total words: ${words.length}  Unique: ${counts.size}`);\n[...counts].sort((a, b) => b[1] - a[1]).slice(0, 5)\n  .forEach(([w, n]) => console.log(w.padEnd(10), n));',
  },
});

task({
  id: 'todo', re: /to-?do|task (list|manager)/, title: 'To-do list',
  explain: ['Add, complete, list and delete tasks from the command line.', 'Saves to a JSON file so tasks persist between runs.'],
  langs: {
    python: 'import json\nimport sys\nfrom pathlib import Path\n\nDB = Path("todos.json")\n\n\ndef load() -> list[dict]:\n    return json.loads(DB.read_text()) if DB.exists() else []\n\n\ndef save(todos: list[dict]) -> None:\n    DB.write_text(json.dumps(todos, indent=2))\n\n\ndef main(argv: list[str]) -> None:\n    todos = load()\n    cmd, *rest = argv or ["list"]\n    if cmd == "add":\n        todos.append({"task": " ".join(rest), "done": False})\n    elif cmd == "done":\n        todos[int(rest[0]) - 1]["done"] = True\n    elif cmd == "rm":\n        todos.pop(int(rest[0]) - 1)\n    save(todos)\n    for i, t in enumerate(todos, 1):\n        print(f"{i}. [{\'x\' if t[\'done\'] else \' \'}] {t[\'task\']}")\n\n\nif __name__ == "__main__":\n    main(sys.argv[1:])\n\n# Usage:\n#   python todo.py add Buy milk\n#   python todo.py done 1\n#   python todo.py list',
    javascript: 'import { readFileSync, writeFileSync, existsSync } from "node:fs";\n\nconst DB = "todos.json";\nconst todos = existsSync(DB) ? JSON.parse(readFileSync(DB, "utf8")) : [];\nconst [cmd = "list", ...rest] = process.argv.slice(2);\n\nif (cmd === "add") todos.push({ task: rest.join(" "), done: false });\nif (cmd === "done") todos[Number(rest[0]) - 1].done = true;\nif (cmd === "rm") todos.splice(Number(rest[0]) - 1, 1);\n\nwriteFileSync(DB, JSON.stringify(todos, null, 2));\ntodos.forEach((t, i) => console.log(`${i + 1}. [${t.done ? "x" : " "}] ${t.task}`));\n\n// node todo.mjs add "Buy milk"',
  },
});

task({
  id: 'scraper', re: /scrap(e|er|ing)|crawl/, title: 'Web scraper',
  explain: ['Downloads a page and parses the HTML with BeautifulSoup.', 'Extracts headlines and links; respects timeouts and sets a User-Agent.', 'Always check a site\'s terms of service and robots.txt before scraping.'],
  langs: {
    python: '# pip install requests beautifulsoup4\nimport requests\nfrom bs4 import BeautifulSoup\n\nURL = "https://example.com"\nheaders = {"User-Agent": "NovaScraper/1.0 (+https://example.com/contact)"}\n\nresponse = requests.get(URL, headers=headers, timeout=10)\nresponse.raise_for_status()\nsoup = BeautifulSoup(response.text, "html.parser")\n\nprint("Title:", soup.title.string if soup.title else "—")\nfor h in soup.select("h1, h2, h3"):\n    print("•", h.get_text(strip=True))\nfor a in soup.select("a[href]")[:10]:\n    print(a.get_text(strip=True) or "(no text)", "→", a["href"])',
    javascript: '// npm install cheerio\nimport * as cheerio from "cheerio";\n\nconst res = await fetch("https://example.com", { headers: { "User-Agent": "NovaScraper/1.0" } });\nconst $ = cheerio.load(await res.text());\n\nconsole.log("Title:", $("title").text());\n$("h1, h2, h3").each((_, el) => console.log("•", $(el).text().trim()));\n$("a[href]").slice(0, 10).each((_, el) => console.log($(el).text().trim(), "→", $(el).attr("href")));',
  },
});

task({
  id: 'emailregex', re: /email.*(valid|regex)|validate.*email|regex/, title: 'Validate an email address',
  explain: ['A pragmatic regex: something@domain.tld with no spaces.', 'For production, also send a confirmation email — regex alone can\'t prove an address exists.'],
  langs: {
    python: 'import re\n\nEMAIL_RE = re.compile(r"^[\\w.+-]+@[\\w-]+(\\.[\\w-]+)+$")\n\n\ndef is_valid_email(address: str) -> bool:\n    return bool(EMAIL_RE.match(address.strip()))\n\n\nfor e in ["nova@example.com", "bad@", "a.b+tag@mail.co.uk"]:\n    print(e, is_valid_email(e))',
    javascript: 'const EMAIL_RE = /^[\\w.+-]+@[\\w-]+(\\.[\\w-]+)+$/;\nconst isValidEmail = (s) => EMAIL_RE.test(s.trim());\n\nfor (const e of ["nova@example.com", "bad@", "a.b+tag@mail.co.uk"]) {\n  console.log(e, isValidEmail(e));\n}',
  },
});

task({
  id: 'gcd', re: /\bgcd\b|greatest common|\blcm\b|least common multiple/, title: 'GCD and LCM',
  explain: ['Euclid\'s algorithm: gcd(a, b) = gcd(b, a mod b).', 'lcm(a, b) = |a·b| / gcd(a, b).'],
  complexity: 'O(log min(a, b)).',
  langs: {
    python: 'def gcd(a: int, b: int) -> int:\n    while b:\n        a, b = b, a % b\n    return abs(a)\n\n\ndef lcm(a: int, b: int) -> int:\n    return abs(a * b) // gcd(a, b) if a and b else 0\n\n\nprint(gcd(48, 18), lcm(4, 6))  # 6 12',
    javascript: 'const gcd = (a, b) => (b === 0 ? Math.abs(a) : gcd(b, a % b));\nconst lcm = (a, b) => (a && b ? Math.abs(a * b) / gcd(a, b) : 0);\n\nconsole.log(gcd(48, 18), lcm(4, 6)); // 6 12',
  },
  output: '6 12',
});

task({
  id: 'sqlschema', re: /\bsql\b|database|schema|query|table/, langOnly: ['sql'], title: 'SQL schema & queries',
  explain: ['Creates related tables with primary/foreign keys and constraints.', 'Shows inserts, a JOIN with aggregation, and an index for speed.'],
  langs: {
    sql: '-- Schema\nCREATE TABLE users (\n  id         INTEGER PRIMARY KEY,\n  name       TEXT NOT NULL,\n  email      TEXT NOT NULL UNIQUE,\n  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n);\n\nCREATE TABLE orders (\n  id       INTEGER PRIMARY KEY,\n  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n  total    DECIMAL(10, 2) NOT NULL CHECK (total >= 0),\n  placed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n);\n\nCREATE INDEX idx_orders_user ON orders(user_id);\n\n-- Sample data\nINSERT INTO users (name, email) VALUES\n  (\'Ada\', \'ada@example.com\'),\n  (\'Linus\', \'linus@example.com\');\n\nINSERT INTO orders (user_id, total) VALUES (1, 42.50), (1, 19.99), (2, 99.00);\n\n-- Total spent per user, highest first\nSELECT u.name,\n       COUNT(o.id)  AS orders,\n       SUM(o.total) AS total_spent\nFROM users u\nLEFT JOIN orders o ON o.user_id = u.id\nGROUP BY u.id, u.name\nORDER BY total_spent DESC;',
  },
});

task({
  id: 'matrix', re: /matrix|matrices/, title: 'Matrix multiplication',
  explain: ['Multiplies an m×n matrix by an n×p matrix.', 'Each cell is the dot product of a row and a column.'],
  complexity: 'O(m·n·p).',
  langs: {
    python: 'def matmul(a: list[list[float]], b: list[list[float]]) -> list[list[float]]:\n    if len(a[0]) != len(b):\n        raise ValueError("Incompatible shapes")\n    return [[sum(x * y for x, y in zip(row, col)) for col in zip(*b)] for row in a]\n\n\nA = [[1, 2], [3, 4]]\nB = [[5, 6], [7, 8]]\nprint(matmul(A, B))  # [[19, 22], [43, 50]]\n\n# With NumPy: import numpy as np; np.array(A) @ np.array(B)',
    javascript: 'function matmul(a, b) {\n  if (a[0].length !== b.length) throw new Error("Incompatible shapes");\n  return a.map((row) => b[0].map((_, j) => row.reduce((s, x, k) => s + x * b[k][j], 0)));\n}\n\nconsole.log(matmul([[1, 2], [3, 4]], [[5, 6], [7, 8]])); // [[19,22],[43,50]]',
  },
  output: '[[19, 22], [43, 50]]',
});

task({
  id: 'async', re: /async|await|promise|debounce|throttle/, title: 'Async patterns',
  explain: ['Runs requests in parallel with `Promise.all` and handles failures with `allSettled`.', 'Includes a reusable `debounce` helper for inputs and resize events.'],
  langs: {
    javascript: 'const sleep = (ms) => new Promise((r) => setTimeout(r, ms));\n\nasync function fetchUser(id) {\n  await sleep(200 * id);\n  if (id === 3) throw new Error(`User ${id} not found`);\n  return { id, name: `User ${id}` };\n}\n\nasync function main() {\n  // Parallel — fails fast if any rejects\n  const users = await Promise.all([1, 2].map(fetchUser));\n  console.log(users);\n\n  // Parallel — collect every outcome\n  const results = await Promise.allSettled([1, 2, 3].map(fetchUser));\n  results.forEach((r) => console.log(r.status, r.value ?? r.reason.message));\n}\n\nfunction debounce(fn, wait = 300) {\n  let t;\n  return (...args) => {\n    clearTimeout(t);\n    t = setTimeout(() => fn(...args), wait);\n  };\n}\n\nmain();',
    python: 'import asyncio\n\n\nasync def fetch_user(uid: int) -> dict:\n    await asyncio.sleep(0.2 * uid)\n    if uid == 3:\n        raise LookupError(f"User {uid} not found")\n    return {"id": uid, "name": f"User {uid}"}\n\n\nasync def main() -> None:\n    users = await asyncio.gather(fetch_user(1), fetch_user(2))\n    print(users)\n    results = await asyncio.gather(*(fetch_user(i) for i in (1, 2, 3)), return_exceptions=True)\n    for r in results:\n        print("error:" if isinstance(r, Exception) else "ok:", r)\n\n\nasyncio.run(main())',
  },
});

// ---------- HTML mini apps ----------
const BASE_CSS = `* { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
      background: radial-gradient(900px 500px at 80% -10%, #3b1f7a55, transparent), #0a0e26;
      color: #e9ebff;
    }
    button { font: inherit; cursor: pointer; border: 0; border-radius: 12px; padding: 10px 16px; background: linear-gradient(135deg, #2347e8, #9d4dff); color: #fff; font-weight: 600; }
    input { font: inherit; color: inherit; background: #121a3e; border: 1px solid #2b3570; border-radius: 12px; padding: 10px 14px; outline: none; }
    input:focus { border-color: #8b6cff; }`;

const HTML_APPS = [
  {
    id: 'landing', re: /landing page|website|homepage|home page|web ?page|site\b|portfolio/, title: 'Responsive landing page',
    explain: ['Hero section with gradient headline, call-to-action buttons and a feature grid.', 'Fully responsive with CSS Grid — no frameworks needed.', 'Click **Run** to preview it live, or **Edit** to customize it in the canvas.'],
    code: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Lumen — Build faster</title>
  <style>
    :root { --bg: #070a1c; --card: #10163a; --text: #e9ebff; --muted: #a9b0d6; --grad: linear-gradient(135deg, #2347e8, #9d4dff); }
    * { box-sizing: border-box; margin: 0; }
    body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; }
    nav { display: flex; justify-content: space-between; align-items: center; padding: 20px 6vw; }
    .logo { font-weight: 800; font-size: 1.3rem; }
    .logo span { background: var(--grad); -webkit-background-clip: text; color: transparent; }
    nav a { color: var(--muted); text-decoration: none; margin-left: 24px; }
    nav a:hover { color: var(--text); }
    .hero { text-align: center; padding: 12vh 6vw 10vh; background: radial-gradient(800px 400px at 50% 0%, #3b1f7a66, transparent); }
    .badge { display: inline-block; padding: 6px 14px; border-radius: 999px; border: 1px solid #2b3570; color: var(--muted); font-size: .9rem; margin-bottom: 24px; }
    h1 { font-size: clamp(2.4rem, 6vw, 4.5rem); line-height: 1.1; letter-spacing: -1px; margin-bottom: 20px; }
    h1 em { font-style: normal; background: var(--grad); -webkit-background-clip: text; color: transparent; }
    .hero p { color: var(--muted); font-size: 1.2rem; max-width: 600px; margin: 0 auto 36px; }
    .btn { display: inline-block; padding: 14px 28px; border-radius: 14px; font-weight: 600; text-decoration: none; margin: 6px; transition: transform .2s; }
    .btn:hover { transform: translateY(-2px); }
    .primary { background: var(--grad); color: #fff; box-shadow: 0 10px 30px -10px #6d3df5; }
    .ghost { border: 1px solid #2b3570; color: var(--text); }
    .features { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 20px; padding: 0 6vw 12vh; max-width: 1200px; margin: 0 auto; }
    .card { background: var(--card); border: 1px solid #1f2858; border-radius: 20px; padding: 28px; transition: border-color .2s, transform .2s; }
    .card:hover { border-color: #8b6cff; transform: translateY(-4px); }
    .icon { font-size: 2rem; margin-bottom: 12px; }
    .card h3 { margin-bottom: 8px; }
    .card p { color: var(--muted); }
    footer { text-align: center; color: var(--muted); padding: 30px; border-top: 1px solid #1f2858; }
  </style>
</head>
<body>
  <nav>
    <div class="logo">✦ <span>Lumen</span></div>
    <div><a href="#features">Features</a><a href="#pricing">Pricing</a><a href="#about">About</a></div>
  </nav>

  <section class="hero">
    <div class="badge">🚀 Now in public beta</div>
    <h1>Build beautiful products <em>at the speed of light</em></h1>
    <p>Lumen gives your team everything it needs to design, ship and scale — all in one luminous workspace.</p>
    <a class="btn primary" href="#">Get started free</a>
    <a class="btn ghost" href="#">Watch demo</a>
  </section>

  <section class="features" id="features">
    <div class="card"><div class="icon">⚡</div><h3>Lightning fast</h3><p>Optimized from the ground up so every interaction feels instant.</p></div>
    <div class="card"><div class="icon">🎨</div><h3>Beautiful by default</h3><p>Thoughtful design tokens and components that look great out of the box.</p></div>
    <div class="card"><div class="icon">🔒</div><h3>Secure</h3><p>Enterprise-grade security with encryption at rest and in transit.</p></div>
    <div class="card"><div class="icon">🤝</div><h3>Collaborative</h3><p>Real-time editing, comments and sharing for the whole team.</p></div>
  </section>

  <footer>© ${new Date().getFullYear()} Lumen. Made with ✦</footer>
</body>
</html>`,
  },
  {
    id: 'todoapp', re: /to-?do|task (list|app)|checklist/, title: 'To-do app',
    explain: ['Add, complete, filter and delete tasks.', 'Saves to `localStorage`, so your list survives a refresh.', 'Click **Run** to try it right here.'],
    code: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tasks</title>
  <style>
    ${BASE_CSS}
    .app { max-width: 480px; margin: 8vh auto; padding: 24px; background: #10163a; border: 1px solid #1f2858; border-radius: 24px; box-shadow: 0 30px 80px -30px #000; }
    h1 { margin: 0 0 16px; font-size: 1.6rem; }
    form { display: flex; gap: 8px; margin-bottom: 14px; }
    form input { flex: 1; }
    .filters { display: flex; gap: 6px; margin-bottom: 10px; }
    .filters button { background: transparent; border: 1px solid #2b3570; padding: 6px 12px; font-weight: 500; color: #a9b0d6; }
    .filters button.active { background: #1d2759; color: #fff; }
    ul { list-style: none; padding: 0; margin: 0; }
    li { display: flex; align-items: center; gap: 10px; padding: 12px; border-radius: 12px; animation: in .2s; }
    li:hover { background: #161e4a; }
    li.done span { text-decoration: line-through; color: #727aa8; }
    li span { flex: 1; }
    li input { accent-color: #8b6cff; width: 18px; height: 18px; }
    li .del { background: transparent; color: #ff6b8a; padding: 4px 8px; opacity: 0; }
    li:hover .del { opacity: 1; }
    .meta { color: #727aa8; font-size: .9rem; margin-top: 10px; }
    @keyframes in { from { opacity: 0; transform: translateY(-4px); } }
  </style>
</head>
<body>
  <div class="app">
    <h1>✦ My Tasks</h1>
    <form id="form"><input id="input" placeholder="What needs doing?" autocomplete="off"><button>Add</button></form>
    <div class="filters"><button data-f="all" class="active">All</button><button data-f="active">Active</button><button data-f="done">Done</button></div>
    <ul id="list"></ul>
    <div class="meta" id="meta"></div>
  </div>
  <script>
    const KEY = "nova-tasks";
    let tasks = JSON.parse(localStorage.getItem(KEY) || "[]");
    let filter = "all";
    const $ = (s) => document.querySelector(s);
    const save = () => localStorage.setItem(KEY, JSON.stringify(tasks));

    function render() {
      const shown = tasks.filter((t) => filter === "all" || (filter === "done" ? t.done : !t.done));
      $("#list").innerHTML = shown.map((t) => \`
        <li class="\${t.done ? "done" : ""}" data-id="\${t.id}">
          <input type="checkbox" \${t.done ? "checked" : ""}>
          <span></span>
          <button class="del" title="Delete">✕</button>
        </li>\`).join("");
      $("#list").querySelectorAll("li").forEach((li, i) => (li.querySelector("span").textContent = shown[i].text));
      const left = tasks.filter((t) => !t.done).length;
      $("#meta").textContent = \`\${left} task\${left === 1 ? "" : "s"} left\`;
    }

    $("#form").addEventListener("submit", (e) => {
      e.preventDefault();
      const text = $("#input").value.trim();
      if (!text) return;
      tasks.unshift({ id: Date.now(), text, done: false });
      $("#input").value = "";
      save(); render();
    });

    $("#list").addEventListener("click", (e) => {
      const id = Number(e.target.closest("li")?.dataset.id);
      if (!id) return;
      if (e.target.matches("input")) tasks = tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
      if (e.target.matches(".del")) tasks = tasks.filter((t) => t.id !== id);
      save(); render();
    });

    document.querySelectorAll(".filters button").forEach((b) => b.addEventListener("click", () => {
      document.querySelector(".filters .active").classList.remove("active");
      b.classList.add("active");
      filter = b.dataset.f;
      render();
    }));

    render();
  </script>
</body>
</html>`,
  },
  {
    id: 'calcapp', re: /calculator/, title: 'Calculator app',
    explain: ['A clean, keyboard-friendly calculator with chained operations.', 'Supports %, ±, decimals and backspace.', 'Click **Run** to use it.'],
    code: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Calculator</title>
  <style>
    ${BASE_CSS}
    body { display: grid; place-items: center; }
    .calc { width: 320px; padding: 20px; background: #10163a; border-radius: 28px; border: 1px solid #1f2858; box-shadow: 0 30px 80px -20px #000; }
    .screen { text-align: right; padding: 16px 8px 20px; }
    .prev { color: #727aa8; min-height: 22px; font-size: .95rem; }
    .cur { font-size: 2.8rem; font-weight: 300; overflow-x: auto; white-space: nowrap; }
    .keys { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
    .keys button { height: 62px; border-radius: 18px; font-size: 1.3rem; background: #18214a; font-weight: 500; transition: filter .15s, transform .1s; }
    .keys button:active { transform: scale(.95); }
    .keys button:hover { filter: brightness(1.2); }
    .keys .op { background: linear-gradient(135deg, #2347e8, #6d3df5); }
    .keys .fn { background: #232d63; color: #c4b5fd; }
    .keys .eq { background: linear-gradient(135deg, #6d3df5, #b14dff); }
    .keys .zero { grid-column: span 2; }
  </style>
</head>
<body>
  <div class="calc">
    <div class="screen"><div class="prev" id="prev"></div><div class="cur" id="cur">0</div></div>
    <div class="keys">
      <button class="fn" data-k="C">C</button><button class="fn" data-k="±">±</button><button class="fn" data-k="%">%</button><button class="op" data-k="/">÷</button>
      <button data-k="7">7</button><button data-k="8">8</button><button data-k="9">9</button><button class="op" data-k="*">×</button>
      <button data-k="4">4</button><button data-k="5">5</button><button data-k="6">6</button><button class="op" data-k="-">−</button>
      <button data-k="1">1</button><button data-k="2">2</button><button data-k="3">3</button><button class="op" data-k="+">+</button>
      <button class="zero" data-k="0">0</button><button data-k=".">.</button><button class="eq" data-k="=">=</button>
    </div>
  </div>
  <script>
    let cur = "0", prev = null, op = null, fresh = false;
    const sym = { "/": "÷", "*": "×", "-": "−", "+": "+" };
    const calc = (a, b, o) => ({ "+": a + b, "-": a - b, "*": a * b, "/": b === 0 ? NaN : a / b })[o];
    const fmt = (n) => (Number.isFinite(n) ? String(parseFloat(n.toPrecision(12))) : "Error");

    function press(k) {
      if (/\\d/.test(k)) { cur = fresh || cur === "0" ? k : cur + k; fresh = false; }
      else if (k === ".") { if (fresh) { cur = "0."; fresh = false; } else if (!cur.includes(".")) cur += "."; }
      else if (k === "C") { cur = "0"; prev = op = null; }
      else if (k === "±") cur = fmt(-parseFloat(cur));
      else if (k === "%") cur = fmt(parseFloat(cur) / 100);
      else if (k === "Backspace") cur = cur.length > 1 ? cur.slice(0, -1) : "0";
      else if (k in sym) {
        if (op && !fresh) cur = fmt(calc(parseFloat(prev), parseFloat(cur), op));
        prev = cur; op = k; fresh = true;
      } else if (k === "=" || k === "Enter") {
        if (!op) return;
        document.getElementById("prev").textContent = prev + " " + sym[op] + " " + cur + " =";
        cur = fmt(calc(parseFloat(prev), parseFloat(cur), op));
        op = null; fresh = true;
        return render(true);
      }
      render();
    }
    function render(keepPrev) {
      document.getElementById("cur").textContent = cur;
      if (!keepPrev) document.getElementById("prev").textContent = op ? prev + " " + sym[op] : "";
    }
    document.querySelectorAll("[data-k]").forEach((b) => b.addEventListener("click", () => press(b.dataset.k)));
    addEventListener("keydown", (e) => { if (/^[\\d.+\\-*/=%]$|Enter|Backspace|Escape/.test(e.key)) press(e.key === "Escape" ? "C" : e.key); });
  </script>
</body>
</html>`,
  },
  {
    id: 'game', re: /\bgame\b/, title: 'Star Catcher — canvas game',
    explain: ['An original arcade game: move the ship to catch falling stars and dodge meteors.', 'Uses `requestAnimationFrame` for a smooth game loop and keyboard/touch controls.', 'Click **Run** to play — arrow keys or drag to move.'],
    code: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Star Catcher</title>
  <style>
    html, body { margin: 0; height: 100%; background: #04061a; overflow: hidden; font-family: system-ui, sans-serif; color: #fff; }
    canvas { display: block; width: 100%; height: 100%; touch-action: none; }
    #hud { position: fixed; top: 12px; left: 16px; font-weight: 700; letter-spacing: .5px; }
    #msg { position: fixed; inset: 0; display: grid; place-items: center; text-align: center; pointer-events: none; }
    #msg h1 { margin: 0; font-size: 2.4rem; background: linear-gradient(90deg, #7d9bff, #d3a6ff); -webkit-background-clip: text; color: transparent; }
  </style>
</head>
<body>
  <canvas id="c"></canvas>
  <div id="hud">★ 0 &nbsp; ♥ 3</div>
  <div id="msg"><div><h1>Star Catcher</h1><p>Catch ★ stars, dodge ● meteors.<br>Press any key or tap to start.</p></div></div>
  <script>
    const c = document.getElementById("c"), ctx = c.getContext("2d");
    const hud = document.getElementById("hud"), msg = document.getElementById("msg");
    let W, H, ship, items, score, lives, running = false, keys = {}, last = 0, spawn = 0;
    const bg = Array.from({ length: 120 }, () => ({ x: Math.random(), y: Math.random(), s: Math.random() * 1.5 + .3 }));
    function resize() { W = c.width = innerWidth * devicePixelRatio; H = c.height = innerHeight * devicePixelRatio; }
    addEventListener("resize", resize); resize();

    function reset() { ship = { x: W / 2, y: H - 80 * devicePixelRatio, w: 46 * devicePixelRatio }; items = []; score = 0; lives = 3; spawn = 0; }
    function start() { if (running) return; reset(); running = true; msg.style.display = "none"; last = performance.now(); requestAnimationFrame(loop); }
    addEventListener("keydown", (e) => { keys[e.key] = true; start(); });
    addEventListener("keyup", (e) => (keys[e.key] = false));
    c.addEventListener("pointerdown", start);
    c.addEventListener("pointermove", (e) => { if (running && e.buttons) ship.x = e.clientX * devicePixelRatio; });

    function loop(t) {
      const dt = Math.min(0.05, (t - last) / 1000); last = t;
      const speed = 520 * devicePixelRatio;
      if (keys.ArrowLeft || keys.a) ship.x -= speed * dt;
      if (keys.ArrowRight || keys.d) ship.x += speed * dt;
      ship.x = Math.max(ship.w, Math.min(W - ship.w, ship.x));

      spawn -= dt;
      if (spawn <= 0) {
        spawn = Math.max(0.25, 0.9 - score * 0.01);
        const meteor = Math.random() < 0.3 + Math.min(0.3, score * 0.005);
        items.push({ x: Math.random() * W, y: -20, v: (180 + Math.random() * 160 + score * 4) * devicePixelRatio, meteor, r: (meteor ? 16 : 12) * devicePixelRatio });
      }

      ctx.fillStyle = "#04061a"; ctx.fillRect(0, 0, W, H);
      for (const s of bg) { s.y = (s.y + s.s * dt * 0.05) % 1; ctx.fillStyle = "rgba(200,190,255," + s.s / 2 + ")"; ctx.fillRect(s.x * W, s.y * H, s.s * 2, s.s * 2); }

      for (const it of items) {
        it.y += it.v * dt;
        const hit = Math.abs(it.x - ship.x) < ship.w * 0.8 && Math.abs(it.y - ship.y) < 30 * devicePixelRatio;
        if (hit) { it.dead = true; if (it.meteor) lives--; else score++; }
        if (it.y > H + 30) it.dead = true;
        ctx.save(); ctx.translate(it.x, it.y);
        if (it.meteor) {
          const g = ctx.createRadialGradient(0, 0, 2, 0, 0, it.r); g.addColorStop(0, "#ff9f7a"); g.addColorStop(1, "#7a2d3d");
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, it.r, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.fillStyle = "#ffe27a"; ctx.shadowColor = "#ffd34d"; ctx.shadowBlur = 20; ctx.beginPath();
          for (let i = 0; i < 10; i++) { const a = (i * Math.PI) / 5 - Math.PI / 2, r = i % 2 ? it.r / 2.2 : it.r; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
          ctx.fill();
        }
        ctx.restore();
      }
      items = items.filter((i) => !i.dead);

      ctx.save(); ctx.translate(ship.x, ship.y);
      const g = ctx.createLinearGradient(-ship.w, 0, ship.w, 0); g.addColorStop(0, "#3b6bff"); g.addColorStop(1, "#b16cff");
      ctx.fillStyle = g; ctx.shadowColor = "#8b6cff"; ctx.shadowBlur = 25;
      ctx.beginPath(); ctx.moveTo(0, -26 * devicePixelRatio); ctx.lineTo(ship.w / 2, 18 * devicePixelRatio); ctx.lineTo(0, 8 * devicePixelRatio); ctx.lineTo(-ship.w / 2, 18 * devicePixelRatio); ctx.closePath(); ctx.fill();
      ctx.restore();

      hud.textContent = "★ " + score + "   ♥ " + Math.max(0, lives);
      if (lives <= 0) {
        running = false; msg.style.display = "grid";
        msg.innerHTML = "<div><h1>Game over</h1><p>You caught " + score + " stars ✦<br>Press any key or tap to play again.</p></div>";
        return;
      }
      requestAnimationFrame(loop);
    }
  </script>
</body>
</html>`,
  },
  {
    id: 'clock', re: /clock|digital clock|countdown|timer|stopwatch/, title: 'Animated clock & stopwatch',
    explain: ['Live digital clock with date, plus a precise stopwatch with laps.', 'Uses `requestAnimationFrame` for smooth updates.'],
    code: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Clock</title>
  <style>
    ${BASE_CSS}
    body { display: grid; place-items: center; text-align: center; }
    .time { font-size: clamp(3rem, 12vw, 7rem); font-weight: 200; font-variant-numeric: tabular-nums; background: linear-gradient(90deg, #7d9bff, #d3a6ff); -webkit-background-clip: text; color: transparent; }
    .date { color: #a9b0d6; margin-bottom: 40px; }
    .sw { font-size: 2.4rem; font-variant-numeric: tabular-nums; margin-bottom: 14px; }
    .row { display: flex; gap: 10px; justify-content: center; }
    .secondary { background: #18214a; }
    ol { color: #a9b0d6; text-align: left; max-height: 160px; overflow: auto; font-variant-numeric: tabular-nums; }
  </style>
</head>
<body>
  <div>
    <div class="time" id="time"></div>
    <div class="date" id="date"></div>
    <div class="sw" id="sw">00:00.00</div>
    <div class="row"><button id="start">Start</button><button class="secondary" id="lap">Lap</button><button class="secondary" id="reset">Reset</button></div>
    <ol id="laps"></ol>
  </div>
  <script>
    let t0 = 0, elapsed = 0, running = false;
    const fmt = (ms) => { const m = Math.floor(ms / 60000), s = Math.floor(ms / 1000) % 60, cs = Math.floor(ms / 10) % 100; return [m, s].map((x) => String(x).padStart(2, "0")).join(":") + "." + String(cs).padStart(2, "0"); };
    function tick() {
      const now = new Date();
      time.textContent = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      date.textContent = now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" });
      sw.textContent = fmt(running ? elapsed + performance.now() - t0 : elapsed);
      requestAnimationFrame(tick);
    }
    start.onclick = () => {
      if (running) { elapsed += performance.now() - t0; running = false; start.textContent = "Start"; }
      else { t0 = performance.now(); running = true; start.textContent = "Pause"; }
    };
    lap.onclick = () => { const li = document.createElement("li"); li.textContent = sw.textContent; laps.prepend(li); };
    reset.onclick = () => { elapsed = 0; t0 = performance.now(); laps.innerHTML = ""; };
    tick();
  </script>
</body>
</html>`,
  },
  {
    id: 'form', re: /\bform\b|sign ?up|login|contact/, title: 'Sign-up form with validation',
    explain: ['Accessible form with live validation and a password-strength meter.', 'Prevents submission until every field is valid.'],
    code: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign up</title>
  <style>
    ${BASE_CSS}
    body { display: grid; place-items: center; padding: 20px; }
    form { width: min(380px, 100%); padding: 28px; background: #10163a; border-radius: 24px; border: 1px solid #1f2858; }
    h1 { margin: 0 0 4px; } p { color: #a9b0d6; margin: 0 0 20px; }
    label { display: block; font-size: .9rem; margin: 14px 0 6px; color: #c8cdf0; }
    input { width: 100%; }
    .err { color: #ff6b8a; font-size: .82rem; min-height: 1em; margin-top: 4px; }
    .meter { height: 6px; border-radius: 6px; background: #1d2759; margin-top: 8px; overflow: hidden; }
    .meter i { display: block; height: 100%; width: 0; transition: width .3s, background .3s; }
    button { width: 100%; margin-top: 20px; }
    button:disabled { opacity: .4; cursor: not-allowed; }
    .ok { text-align: center; font-size: 1.1rem; }
  </style>
</head>
<body>
  <form id="f" novalidate>
    <h1>Create account</h1><p>Join in under a minute.</p>
    <label for="name">Name</label><input id="name" required minlength="2"><div class="err" data-for="name"></div>
    <label for="email">Email</label><input id="email" type="email" required><div class="err" data-for="email"></div>
    <label for="pw">Password</label><input id="pw" type="password" required minlength="8"><div class="meter"><i id="bar"></i></div><div class="err" data-for="pw"></div>
    <button id="submit" disabled>Sign up</button>
  </form>
  <script>
    const f = document.getElementById("f");
    const rules = {
      name: (v) => (v.trim().length >= 2 ? "" : "Please enter your name."),
      email: (v) => (/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(v) ? "" : "Enter a valid email."),
      pw: (v) => (v.length >= 8 ? "" : "At least 8 characters."),
    };
    function strength(v) { let s = 0; if (v.length >= 8) s++; if (/[A-Z]/.test(v)) s++; if (/\\d/.test(v)) s++; if (/[^\\w]/.test(v)) s++; return s; }
    f.addEventListener("input", (e) => {
      const el = e.target;
      if (rules[el.id]) f.querySelector('[data-for="' + el.id + '"]').textContent = el.value ? rules[el.id](el.value) : "";
      if (el.id === "pw") { const s = strength(el.value); bar.style.width = s * 25 + "%"; bar.style.background = ["#ff6b8a", "#ff9f6b", "#ffd479", "#4ade9b"][Math.max(0, s - 1)]; }
      submit.disabled = Object.keys(rules).some((k) => rules[k](document.getElementById(k).value));
    });
    f.addEventListener("submit", (e) => { e.preventDefault(); f.innerHTML = '<div class="ok">🎉 Welcome aboard, ' + document.getElementById("name").value.replace(/[<>&]/g, "") + '!</div>'; });
  </script>
</body>
</html>`,
  },
];

const REACT_COUNTER = `import { useState } from "react";

export default function Counter({ initial = 0, step = 1 }) {
  const [count, setCount] = useState(initial);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, fontFamily: "system-ui" }}>
      <button onClick={() => setCount((c) => c - step)} aria-label="Decrease">−</button>
      <output style={{ minWidth: 48, textAlign: "center", fontSize: 24 }}>{count}</output>
      <button onClick={() => setCount((c) => c + step)} aria-label="Increase">+</button>
      <button onClick={() => setCount(initial)}>Reset</button>
    </div>
  );
}`;

const REACT_TODO = `import { useEffect, useState } from "react";

export default function TodoApp() {
  const [todos, setTodos] = useState(() => JSON.parse(localStorage.getItem("todos") ?? "[]"));
  const [text, setText] = useState("");

  useEffect(() => localStorage.setItem("todos", JSON.stringify(todos)), [todos]);

  const add = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setTodos([{ id: crypto.randomUUID(), text: text.trim(), done: false }, ...todos]);
    setText("");
  };
  const toggle = (id) => setTodos(todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  const remove = (id) => setTodos(todos.filter((t) => t.id !== id));

  return (
    <main style={{ maxWidth: 420, margin: "40px auto", fontFamily: "system-ui" }}>
      <h1>Tasks</h1>
      <form onSubmit={add} style={{ display: "flex", gap: 8 }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="What needs doing?" style={{ flex: 1 }} />
        <button>Add</button>
      </form>
      <ul>
        {todos.map((t) => (
          <li key={t.id}>
            <label style={{ textDecoration: t.done ? "line-through" : "none" }}>
              <input type="checkbox" checked={t.done} onChange={() => toggle(t.id)} /> {t.text}
            </label>
            <button onClick={() => remove(t.id)} aria-label="Delete">✕</button>
          </li>
        ))}
      </ul>
    </main>
  );
}`;

/** Generate a code answer. Returns markdown, or null if no template fits. */
export function generateCode(text, { depth = 2 } = {}) {
  const t = text.toLowerCase();
  let lang = detectLang(t);
  const wantsApp = /\b(app|website|web ?page|landing|page|site|game|ui|interface|portfolio|form)\b/.test(t);

  if (lang === 'react') {
    const isTodo = /to-?do|task/.test(t);
    return {
      lang: 'jsx', title: isTodo ? 'React to-do app' : 'React counter component',
      md: `Here's a ${isTodo ? 'React to-do app' : 'reusable React counter component'} using hooks:\n\n\`\`\`jsx\n${isTodo ? REACT_TODO : REACT_COUNTER}\n\`\`\`\n\n**How it works**\n${isTodo
        ? '- `useState` holds the list; `useEffect` persists it to `localStorage`.\n- Each item is keyed by a stable `crypto.randomUUID()` id.\n- Toggling and deleting create new arrays, keeping state immutable.'
        : '- `useState` stores the count; the functional updater `c => c + step` avoids stale state.\n- Props `initial` and `step` make it reusable.\n- `<output>` is announced by screen readers when the value changes.'}`,
    };
  }

  if (lang === 'html' || (!lang && wantsApp)) {
    const app = HTML_APPS.find((a) => a.re.test(t)) || (lang === 'html' ? HTML_APPS[0] : null);
    if (app) {
      return {
        lang: 'html', title: app.title,
        md: `Here's a ${app.title.toLowerCase()} — a single, self-contained HTML file:\n\n\`\`\`html\n${app.code}\n\`\`\`\n\n**What's inside**\n${app.explain.map((e) => `- ${e}`).join('\n')}`,
      };
    }
  }

  const tk = T.find((x) => x.re.test(t) && (!x.langOnly || x.langOnly.includes(lang || '')));
  if (!tk) return null;
  if (!lang || !tk.langs[lang]) {
    const requested = lang;
    lang = tk.langs.python && !requested ? 'python' : Object.keys(tk.langs)[0];
    if (requested && requested !== lang) {
      // Requested language isn't in the template library — be upfront about it.
      const info = LANGS[requested];
      const alt = LANGS[lang];
      const code = tk.langs[lang];
      return {
        lang: alt.fence, title: tk.title,
        md: `I don't have an on-device ${info.label} template for **${tk.title.toLowerCase()}** yet, so here it is in ${alt.label} — the logic translates directly:\n\n\`\`\`${alt.fence}\n${code}\n\`\`\`\n\n**How it works**\n${tk.explain.map((e) => `- ${e}`).join('\n')}\n\n> 💡 Connect Claude in **Settings → Engine** and Nova can write this in ${info.label} (or any language) for you.`,
      };
    }
  }
  const info = LANGS[lang];
  const code = tk.langs[lang];
  let md = `Here's ${/^[aeiou]/i.test(tk.title) ? 'an' : 'a'} ${tk.title.toLowerCase()} implementation in ${info.label}:\n\n\`\`\`${info.fence}\n${code}\n\`\`\``;
  if (depth >= 1) md += `\n\n**How it works**\n${tk.explain.map((e) => `- ${e}`).join('\n')}`;
  if (tk.complexity && depth >= 2) md += `\n\n**Complexity:** ${tk.complexity}`;
  if (tk.output && depth >= 1) md += `\n\n**Output**\n\`\`\`text\n${tk.output}\n\`\`\``;
  if (depth >= 3) {
    const others = Object.keys(tk.langs).filter((k) => k !== lang).map((k) => LANGS[k].label);
    if (others.length) md += `\n\nWant it in another language? I can also write this in ${others.slice(0, 5).join(', ')}.`;
  }
  return { lang: info.fence, title: tk.title, md };
}

export function codeScaffold(text, lang) {
  const info = LANGS[lang] || LANGS.python;
  const req = text.replace(/\s+/g, ' ').trim().slice(0, 140);
  const c = info.fence === 'python' || info.fence === 'ruby' || info.fence === 'bash' ? '#' : info.fence === 'sql' ? '--' : '//';
  const body = {
    python: `${c} Task: ${req}\n\n\ndef main() -> None:\n    # TODO: implement the core logic here\n    pass\n\n\nif __name__ == "__main__":\n    main()`,
    javascript: `${c} Task: ${req}\n\nfunction main() {\n  // TODO: implement the core logic here\n}\n\nmain();`,
  }[lang] || `${c} Task: ${req}\n${c} TODO: implement`;
  return { lang: info.fence, md: `Here's a starting structure in ${info.label}:\n\n\`\`\`${info.fence}\n${body}\n\`\`\`\n\nThe on-device engine has a template library for common tasks (algorithms, APIs, classes, file I/O, web apps, games…) but not for this exact request. **Connect Claude in Settings → Engine** and Nova will write the complete solution for you.` };
}
