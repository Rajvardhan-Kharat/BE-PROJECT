import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { StatusChip } from '../components/ui/StatusChip'
import { Banner } from '../components/ui/Banner'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table'
import { Modal } from '../components/ui/Modal'
import { EmptyState } from '../components/ui/EmptyState'

describe('UI Primitives Test Suite', () => {
  describe('Button', () => {
    it('renders text and handles click events', () => {
      const handleClick = vi.fn()
      render(<Button onClick={handleClick}>Verify Record</Button>)
      const btn = screen.getByRole('button', { name: /Verify Record/i })
      expect(btn).toBeInTheDocument()
      fireEvent.click(btn)
      expect(handleClick).toHaveBeenCalledTimes(1)
    })

    it('disables button when loading or disabled prop is passed', () => {
      render(<Button loading>Processing</Button>)
      const btn = screen.getByRole('button', { name: /Processing/i })
      expect(btn).toBeDisabled()
    })
  })

  describe('Input', () => {
    it('renders label and error text when provided', () => {
      render(
        <Input
          label="Patient MRN"
          error="MRN must match format SYN-XXXXX"
          placeholder="SYN-00000"
        />
      )
      expect(screen.getByLabelText(/Patient MRN/i)).toBeInTheDocument()
      expect(screen.getByText(/MRN must match format SYN-XXXXX/i)).toBeInTheDocument()
    })

    it('applies monospace font when mono is set', () => {
      render(<Input label="Record Hash" mono placeholder="hash" />)
      const input = screen.getByLabelText(/Record Hash/i)
      expect(input.className).toContain('font-mono')
    })
  })

  describe('StatusChip', () => {
    it('renders all 6 canonical record statuses with text and icons', () => {
      const statuses = [
        'draft',
        'pending_review',
        'approved',
        'rejected',
        'superseded',
        'requires_correction',
      ] as const

      const labels = [
        'Draft',
        'Pending review',
        'Approved',
        'Rejected',
        'Superseded',
        'Requires correction',
      ]

      const { rerender } = render(<StatusChip status="draft" />)
      expect(screen.getByText('Draft')).toBeInTheDocument()

      statuses.forEach((status, idx) => {
        rerender(<StatusChip status={status} />)
        expect(screen.getByText(labels[idx])).toBeInTheDocument()
      })
    })
  })

  describe('Banner', () => {
    it('renders synthetic banner with warning badge', () => {
      render(
        <Banner variant="synthetic" title="Synthetic Environment">
          Operating on synthetic records only.
        </Banner>
      )
      expect(screen.getByText('Synthetic Environment')).toBeInTheDocument()
      expect(screen.getByText('Synthetic')).toBeInTheDocument()
    })

    it('triggers dismiss callback when close button is clicked', () => {
      const handleDismiss = vi.fn()
      render(
        <Banner title="Notice" onDismiss={handleDismiss}>
          Dismissable content
        </Banner>
      )
      const dismissBtn = screen.getByRole('button', { name: /Dismiss banner/i })
      fireEvent.click(dismissBtn)
      expect(handleDismiss).toHaveBeenCalledTimes(1)
    })
  })

  describe('Table', () => {
    it('renders dense clinical rows and cells', () => {
      render(
        <Table>
          <TableHeader>
            <tr>
              <TableHead>Record ID</TableHead>
              <TableHead>Status</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell mono>REC-001</TableCell>
              <TableCell>Active</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      )
      expect(screen.getByText('Record ID')).toBeInTheDocument()
      expect(screen.getByText('REC-001')).toBeInTheDocument()
    })
  })

  describe('Modal', () => {
    it('renders dialog when isOpen is true', () => {
      const handleClose = vi.fn()
      render(
        <Modal isOpen={true} onClose={handleClose} title="Verify Proposal">
          <div>Proposal details</div>
        </Modal>
      )
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText('Verify Proposal')).toBeInTheDocument()
      expect(screen.getByText('Proposal details')).toBeInTheDocument()
    })

    it('does not render dialog when isOpen is false', () => {
      render(
        <Modal isOpen={false} onClose={() => {}} title="Hidden Dialog">
          <div>Content</div>
        </Modal>
      )
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  describe('EmptyState', () => {
    it('renders sentence-case message and optional action', () => {
      render(
        <EmptyState
          title="No pending verifications"
          description="All synthetic clinical records have been evaluated."
          action={<Button size="sm">Refresh list</Button>}
        />
      )
      expect(screen.getByText('No pending verifications')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Refresh list/i })).toBeInTheDocument()
    })
  })
})
