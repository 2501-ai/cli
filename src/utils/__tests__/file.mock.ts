interface FileMock {
  data: string;
  content: string;
  test: string;
}

/**
 * Just a sample class to test the mock modify_file function on.
 */
export class FileMockClass {
  data: string;
  content: string;
  test: string;

  constructor(options: FileMock) {
    this.data = options.data;
    this.content = options.content;
    this.test = options.test;
  }

  testMock() {
    return this.test;
  }

  /**
   * Longest Common Subsequence (Dynamic Programming)
   */
  lcs(X: string, Y: string): number {
    const dp: number[][] = Array.from({ length: X.length + 1 }, () =>
      Array.from({ length: Y.length + 1 }, () => 0)
    );

    for (let i = 1; i <= X.length; i++) {
      for (let j = 1; j <= Y.length; j++) {
        if (X[i - 1] === Y[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    return dp[X.length - 1][Y.length - 1];
  }

  /**
   * Fibonacci
   * @param {number} n
   */
  fibonacci(n: number): number {
    if (n <= 1) {
      return n;
    }
    return this.fibonacci(n - 1) + this.fibonacci(n - 2);
  }

  /**
   * Cached Fibonacci (more efficient)
   * @param {number} n
   */
  cachedFibonacci(n: number): number {
    const fib = [0, 1];
    for (let i = 2; i <= n; i++) {
      fib[i] = fib[i - 1] + fib[i - 2];
    }
    return fib[n];
  }
}

export function runner() {
  const file = new FileMockClass({
    data: 'data',
    content: 'content',
    test: 'test',
  });

  console.log(file.testMock());
  console.log(file.fibonacci(10));
  console.log(file.cachedFibonacci(10));

  console.log(file.lcs('AGGTAB', 'GXTXAYB'));
  console.log(file.lcs('ABCBDAB', 'BDCAB'));
}
