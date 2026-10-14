import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  assessPhoneInput,
  detectDefaultCountry,
  filterPhoneCountries,
  getPhoneCountries,
  nationalPlaceholder,
} from '../../utils/phoneNumber';
import './PhoneNumberField.scss';

function menuPosition(anchor) {
  const rect = anchor.getBoundingClientRect();
  const width = Math.min(360, Math.max(280, rect.width));
  const estimatedHeight = 320;
  const spaceBelow = window.innerHeight - rect.bottom;
  const openUp = spaceBelow < estimatedHeight && rect.top > spaceBelow;
  const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - width - 8));
  return {
    left,
    width,
    top: openUp ? rect.top - 6 : rect.bottom + 6,
    translateY: openUp ? '-100%' : '0',
  };
}

export default function PhoneNumberField({
  value = '',
  onChange,
  appearance = 'dark',
  disabled = false,
  required = false,
  id,
  ariaLabel = 'WhatsApp number',
}) {
  const listId = useId();
  const hintId = useId();
  const searchId = useId();
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const numberRef = useRef(null);
  const menuRef = useRef(null);
  const searchRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const emittedRef = useRef(null);
  onChangeRef.current = onChange;

  const [country, setCountry] = useState(detectDefaultCountry);
  const [text, setText] = useState('');
  const [status, setStatus] = useState('empty');
  const [blurred, setBlurred] = useState(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [coords, setCoords] = useState(null);

  const countries = useMemo(() => getPhoneCountries(), []);
  const results = useMemo(() => filterPhoneCountries(query), [query]);
  const highlightedIndex = results.length ? Math.min(activeIndex, results.length - 1) : 0;
  const selected = countries.find((item) => item.iso2 === country) || countries[0];
  const tone = appearance === 'light' ? 'light' : 'dark';
  const invalid = blurred && (required ? status !== 'valid' : status === 'invalid');
  const placeholder = nationalPlaceholder(country) || 'Mobile number';

  const apply = (result) => {
    setCountry(result.country);
    setText(result.nationalDisplay);
    setStatus(result.status);
    emittedRef.current = result.e164;
    onChangeRef.current?.({ e164: result.e164, status: result.status });
  };

  useEffect(() => {
    const incoming = value || '';
    if (emittedRef.current !== null && incoming === emittedRef.current) return;
    emittedRef.current = incoming;
    if (!incoming) {
      setText('');
      setStatus('empty');
      return;
    }
    const result = assessPhoneInput(incoming, detectDefaultCountry());
    setCountry(result.country);
    setText(result.nationalDisplay);
    setStatus(result.status);
  }, [value]);

  useEffect(() => {
    const host = rootRef.current?.closest('.contact-page__field');
    if (!host) return undefined;
    host.classList.toggle('is-phone-open', open);
    host.classList.toggle('contact-page__field--invalid', invalid);
    return () => {
      host.classList.remove('is-phone-open');
      host.classList.remove('contact-page__field--invalid');
    };
  }, [open, invalid]);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return undefined;
    const update = () => setCoords(menuPosition(buttonRef.current));
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, results.length]);

  useEffect(() => {
    if (!open) return undefined;
    const frame = requestAnimationFrame(() => searchRef.current?.focus());
    const onPointerDown = (event) => {
      const target = event.target;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onEscape = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onEscape, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onEscape, true);
    };
  }, [open]);

  const openMenu = () => {
    if (disabled) return;
    const current = filterPhoneCountries('').findIndex((item) => item.iso2 === country);
    setQuery('');
    setActiveIndex(current >= 0 ? current : 0);
    setOpen(true);
  };

  const chooseCountry = (iso2) => {
    setOpen(false);
    apply(assessPhoneInput(text, iso2));
    numberRef.current?.focus();
  };

  const onNumberChange = (event) => {
    const next = event.target.value;
    const previousDigits = text.replace(/\D/g, '').length;
    const nextDigits = next.replace(/\D/g, '').length;
    apply(assessPhoneInput(next, country, {
      allowImplicitInternational: nextDigits - previousDigits > 1,
    }));
  };

  const onSearchKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (results.length ? (index + 1) % results.length : 0));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (results.length ? (index - 1 + results.length) % results.length : 0));
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(Math.max(0, results.length - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const pick = results[highlightedIndex];
      if (pick) chooseCountry(pick.iso2);
    } else if (event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      if (event.shiftKey) buttonRef.current?.focus();
      else numberRef.current?.focus();
    }
  };

  useEffect(() => {
    if (!open) return;
    const option = menuRef.current?.querySelector('[data-active="true"]');
    option?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex, query]);

  const menu = open && coords
    ? createPortal(
      <div
        ref={menuRef}
        className={`phone-country-menu phone-country-menu--${tone}`}
        data-phone-country-menu
        style={{
          left: `${coords.left}px`,
          top: `${coords.top}px`,
          width: `${coords.width}px`,
          transform: `translateY(${coords.translateY})`,
        }}
      >
        <div className="phone-country-menu__search">
          <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
          <input
            id={searchId}
            ref={searchRef}
            type="text"
            value={query}
            placeholder="Search country or code"
          aria-label="Search country or code"
          aria-controls={listId}
          aria-activedescendant={results[highlightedIndex] ? `${listId}-${results[highlightedIndex].iso2}` : undefined}
          autoComplete="off"
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={onSearchKeyDown}
          />
        </div>
        <ul id={listId} className="phone-country-menu__list" role="listbox" aria-label="Countries">
          {results.length ? results.map((item, index) => (
            <li key={item.iso2} role="presentation">
              <button
                type="button"
                role="option"
                id={`${listId}-${item.iso2}`}
                className="phone-country-menu__option"
                tabIndex={-1}
                aria-selected={item.iso2 === country}
                data-active={index === highlightedIndex ? 'true' : 'false'}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => chooseCountry(item.iso2)}
              >
                <span className="phone-country-menu__identity">
                  <span className="phone-field__flag" aria-hidden="true">{item.flag}</span>
                  <span>{item.name}</span>
                </span>
                <span className="phone-country-menu__code">+{item.dialCode}</span>
              </button>
            </li>
          )) : (
            <li className="phone-country-menu__empty">No country found</li>
          )}
        </ul>
      </div>,
      document.body
    )
    : null;

  return (
    <div className={`phone-field-wrap phone-field-wrap--${appearance}`} ref={rootRef}>
      <div
        className={`phone-field phone-field--${appearance}${open ? ' is-open' : ''}${invalid ? ' is-invalid' : ''}`}
      >
        <button
          ref={buttonRef}
          type="button"
          className="phone-field__country"
          aria-label={selected ? `Country, ${selected.name}, +${selected.dialCode}` : 'Country code'}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          disabled={disabled}
          onClick={() => (open ? setOpen(false) : openMenu())}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              openMenu();
            }
          }}
        >
          <span className="phone-field__flag" aria-hidden="true">{selected?.flag}</span>
          <span className="phone-field__dial">+{selected?.dialCode}</span>
          <i className={`fa-solid fa-chevron-down phone-field__chevron${open ? ' is-open' : ''}`} aria-hidden="true" />
        </button>
        <input
          ref={numberRef}
          id={id}
          className="phone-field__number"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder={placeholder}
          aria-label={ariaLabel}
          aria-describedby={hintId}
          aria-invalid={invalid || undefined}
          value={text}
          disabled={disabled}
          onChange={onNumberChange}
          onBlur={() => setBlurred(true)}
        />
      </div>
      <p id={hintId} className="phone-field__note">
        Select your country, then enter the mobile number.
      </p>
      {menu}
    </div>
  );
}
