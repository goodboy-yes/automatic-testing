import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AppLayout } from './AppLayout';

describe('AppLayout', () => {
  afterEach(() => {
    cleanup();
  });

  it('does not render deprecated product branding in the project workspace shell', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/projects/project_1']}>
        <Routes>
          <Route path="/projects/:projectId" element={<AppLayout />}>
            <Route index element={<div>项目内容</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    const forbiddenBrand = ['Mid', 'scene'].join('');

    expect(screen.getByText('自动化测试平台')).toBeTruthy();
    expect(container.textContent).not.toContain(forbiddenBrand);
  });
});
