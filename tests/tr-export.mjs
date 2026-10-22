// A realistic Trade Republic export, shared by the import and performance tests: BOM, quoted names with
// commas, unsorted rows, both accounts, savings plan, dividend and interest with withholding tax, unsigned
// sale, split, crypto, private market fund paid in advance, card payment and an unknown movement type.
// It lives in a module rather than a .csv file: .gitignore excludes *.csv (personal exports).
export const HEAD = 'datetime,date,account_type,category,type,asset_class,name,symbol,shares,price,amount,fee,tax,currency,description,transaction_id';
export const ROWS = [
  // Out of order on purpose: the importer sorts by datetime
  '2025-03-10T09:30:00Z,2025-03-10,DEFAULT,TRADING,SELL,STOCK,"Apple Inc., ""Common""",US0378331005,4,250,1000,-1,-10,EUR,Sell,t07',
  '2025-01-02T08:00:00Z,2025-01-02,DEFAULT,CASH,CUSTOMER_INBOUND,,,,,,5000,,,EUR,Deposit,t01',
  '2025-01-02T08:05:00Z,2025-01-02,PEA,CASH,CUSTOMER_INBOUND,,,,,,3000,,,EUR,Deposit,t02',
  '2025-01-10T10:00:00Z,2025-01-10,DEFAULT,TRADING,BUY,STOCK,"Apple Inc., ""Common""",US0378331005,10,200,-2000,-1,,EUR,Buy,t03',
  '2025-01-15T07:00:00Z,2025-01-15,PEA,SAVINGS_PLAN,BUY,FUND,iShares MSCI World Swap PEA,IE0002XZSHO1,100,6,-600,,,EUR,Savings plan,t04',
  '2025-02-15T07:00:00Z,2025-02-15,PEA,SAVINGS_PLAN,BUY,FUND,iShares MSCI World Swap PEA,IE0002XZSHO1,100,6.5,-650,,,EUR,Savings plan,t05',
  '2025-03-01T06:00:00Z,2025-03-01,DEFAULT,CASH,DIVIDEND,STOCK,"Apple Inc., ""Common""",US0378331005,10,,3.5,,-0.53,EUR,Dividend,t06',
  '2025-04-01T06:00:00Z,2025-04-01,DEFAULT,CORPORATE_ACTION,SPLIT,STOCK,"Apple Inc., ""Common""",US0378331005,6,,0,,,EUR,Split,t08',
  '2025-04-05T12:00:00Z,2025-04-05,DEFAULT,TRADING,BUY,CRYPTO,Bitcoin,XF000BTC0017,0.01,60000,-600,-1,,EUR,Buy,t09',
  '2025-04-20T12:00:00Z,2025-04-20,DEFAULT,TRADING,PRIVATE_MARKET_BUY,PRIVATE_FUND,"Fonds privé, Elevate",LU9999999999,,,-1000,,,EUR,Subscription,t10',
  '2025-05-20T12:00:00Z,2025-05-20,DEFAULT,TRADING,BUY,PRIVATE_FUND,"Fonds privé, Elevate",LU9999999999,8,100,0,,,EUR,Execution,t11',
  '2025-05-01T06:00:00Z,2025-05-01,DEFAULT,CASH,INTEREST_PAYMENT,,,,,,12.4,,-3.9,EUR,Interest,t12',
  '2025-05-02T06:00:00Z,2025-05-02,DEFAULT,CASH,BENEFITS_SAVEBACK,,,,,,5,,,EUR,Saveback,t13',
  '2025-05-03T18:00:00Z,2025-05-03,DEFAULT,CASH,CARD_TRANSACTION,,,,,,-42.10,,,EUR,Card payment,t14',
  '2025-05-04T18:00:00Z,2025-05-04,DEFAULT,CASH,SOMETHING_NEW,,,,,,0,,,EUR,Unknown,t15',
];
export const CSV = '﻿' + [HEAD, ...ROWS].join('\r\n') + '\r\n';
