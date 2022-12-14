{
    "transform": {
      "^.+\\.(t|j)sx?$": "ts-jest"
    },
    "testRegex": "(/__tests__/.*|(\\.|/)(test|spec))\\.(jsx?|tsx?)$",
    "testPathIgnorePatterns": ["helpers"],
    "moduleFileExtensions": ["ts", "tsx", "js", "jsx", "json", "node"],
    "coverageReporters": [
      "json-summary"
    ]
  }