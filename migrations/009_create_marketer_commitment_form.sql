CREATE TABLE IF NOT EXISTS marketer_commitment_form (
  id SERIAL PRIMARY KEY,
  marketer_id INTEGER NOT NULL,                     -- Reference to the marketer (should link to users table)
  promise_accept_false_documents BOOLEAN NOT NULL,  -- "I promise I will not accept false or forged documents..."
  promise_not_request_irrelevant_info BOOLEAN NOT NULL,  -- "I promise I will not request for information unrelated..."
  promise_not_charge_customer_fees BOOLEAN NOT NULL,  -- "I promise I will not charge customer fees..."
  promise_not_modify_contract_info BOOLEAN NOT NULL,  -- "I promise I will not modify any contract product information..."
  promise_not_sell_unapproved_phones BOOLEAN NOT NULL, -- "I will not sell phones that are not under our company approved phones..."
  promise_not_make_unofficial_commitment BOOLEAN NOT NULL,  -- "I promise I will not make any non-official/unreasonable/illegal commitment..."
  promise_not_operate_customer_account BOOLEAN NOT NULL,  -- "I promise I will not operate customer’s personal account without their permissions..."
  promise_accept_fraud_firing BOOLEAN NOT NULL,  -- "I promise if company found me involved in any fraudulent act, the company should fire me..."
  promise_not_share_company_info BOOLEAN NOT NULL,  -- "I promise I will not share company’s information with third party..."
  promise_ensure_loan_recovery BOOLEAN NOT NULL,  -- "I promise I will do my best to ensure the company recover all loan amount from my customers..."
  promise_abide_by_system BOOLEAN NOT NULL,       -- "I will strictly abide by the above system..."
  direct_sales_rep_name VARCHAR(255),             -- Name of the Direct Sales Representative
  direct_sales_rep_signature_url TEXT,            -- URL for the uploaded signature image of the Direct Sales Rep
  date_signed TIMESTAMP,                          -- Date when the form was signed/submitted
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,  -- Record creation time
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP   -- Last update time
);