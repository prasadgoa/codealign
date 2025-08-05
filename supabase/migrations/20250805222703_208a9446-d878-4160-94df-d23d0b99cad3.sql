-- Fix the search path security warning for handle_new_user function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER 
SET search_path = 'public'
AS $$
BEGIN
  -- Check if the user's email is in the allowed_emails table
  IF NOT EXISTS (
    SELECT 1 FROM public.allowed_emails 
    WHERE email = NEW.email AND is_active = true
  ) THEN
    -- If email is not allowed, prevent user creation
    RAISE EXCEPTION 'Email % is not authorized to access this system', NEW.email;
  END IF;

  -- Create profile for allowed user
  INSERT INTO public.profiles (user_id, email, display_name, avatar_url)
  VALUES (
    NEW.id, 
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  
  RETURN NEW;
END;
$$;