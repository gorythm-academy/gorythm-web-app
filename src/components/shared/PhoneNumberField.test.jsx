import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PhoneNumberField from './PhoneNumberField';

function Harness() {
  const [value, setValue] = useState('');
  const [status, setStatus] = useState('empty');
  return (
    <div>
      <PhoneNumberField
        appearance="dark"
        value={value}
        onChange={({ e164, status: nextStatus }) => {
          setValue(e164);
          setStatus(nextStatus);
        }}
      />
      <output>{`${status}:${value}`}</output>
    </div>
  );
}

test('country selector produces an international WhatsApp number', async () => {
  const user = userEvent.setup();
  render(<Harness />);

  await user.click(screen.getByRole('button', { name: /country/i }));
  const search = await screen.findByRole('textbox', { name: /search country or code/i });
  await user.type(search, 'Pakistan');
  await user.click(screen.getByRole('option', { name: /Pakistan/i }));

  const number = screen.getByRole('textbox', { name: /whatsapp number/i });
  await user.type(number, '03012345678');

  expect(await screen.findByText('valid:+923012345678')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Pakistan, \+92/i })).toBeInTheDocument();
});
